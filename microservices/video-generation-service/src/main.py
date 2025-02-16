import os
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import torch
from diffusers import StableVideoDiffusionPipeline
from transformers import pipeline
from moviepy.editor import VideoFileClip, ImageSequenceClip
import numpy as np
import cv2
from google.cloud import storage, pubsub_v1
import logging
from logging_config import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)

app = FastAPI()

class VideoRequest(BaseModel):
    """Request model for video generation."""
    prompt: str = Field(..., min_length=1, max_length=1000)
    duration: float = Field(default=10.0, ge=1.0, le=60.0)
    width: int = Field(default=1024, ge=640, le=1920)
    height: int = Field(default=576, ge=360, le=1080)
    fps: int = Field(default=30, ge=24, le=60)
    source_image: Optional[str] = None  # Base64 encoded image for image-to-video
    style: Optional[str] = None

class VideoGenerationService:
    def __init__(self):
        self._load_config()
        self._initialize_clients()
        self._initialize_models()
        logger.info("Video Generation Service initialized")

    def _load_config(self) -> Dict[str, Any]:
        """Load service configuration."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '../config/video-generation-config.json'
        )
        with open(config_path) as f:
            self.config = json.load(f)
        return self.config

    def _initialize_clients(self):
        """Initialize API clients."""
        self.storage_client = storage.Client()
        self.publisher = pubsub_v1.PublisherClient()

    def _initialize_models(self):
        """Initialize video generation models."""
        if torch.cuda.is_available():
            self.device = "cuda"
        else:
            self.device = "cpu"
            logger.warning("CUDA not available, using CPU for inference")

        if self.config['generation']['text_to_video']['enabled']:
            self.text_to_video = pipeline(
                "text-to-video",
                model=self.config['generation']['text_to_video']['model'],
                device=self.device
            )

        if self.config['generation']['image_to_video']['enabled']:
            self.image_to_video = StableVideoDiffusionPipeline.from_pretrained(
                self.config['generation']['image_to_video']['model'],
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                variant="fp16" if self.device == "cuda" else None
            ).to(self.device)

    async def generate_video(self, request: VideoRequest) -> Dict[str, Any]:
        """Generate video based on the request."""
        try:
            if request.source_image:
                video_data = await self._generate_from_image(request)
            else:
                video_data = await self._generate_from_text(request)

            # Check video quality
            if not await self._check_video_quality(video_data):
                raise ValueError("Generated video does not meet quality requirements")

            # Save video to storage
            video_url = await self._save_video(video_data, request)

            result = {
                'url': video_url,
                'metadata': {
                    'prompt': request.prompt,
                    'duration': request.duration,
                    'width': request.width,
                    'height': request.height,
                    'fps': request.fps,
                    'generated_at': datetime.utcnow().isoformat(),
                    'model': 'text-to-video' if not request.source_image else 'image-to-video'
                }
            }

            # Publish result
            await self.publish_result(result)

            return result

        except Exception as e:
            logger.error(f"Error generating video: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Video generation failed: {str(e)}"
            )

    async def _generate_from_text(self, request: VideoRequest) -> bytes:
        """Generate video from text prompt."""
        try:
            # Generate video frames
            outputs = self.text_to_video(
                request.prompt,
                num_frames=int(request.duration * request.fps),
                width=request.width,
                height=request.height
            )

            # Convert frames to video
            frames = [np.array(frame) for frame in outputs]
            clip = ImageSequenceClip(frames, fps=request.fps)

            # Save to temporary file
            temp_path = f"/tmp/video_{datetime.now().timestamp()}.mp4"
            clip.write_videofile(
                temp_path,
                codec='libx264',
                fps=request.fps,
                audio=False
            )

            # Read file and return bytes
            with open(temp_path, 'rb') as f:
                video_data = f.read()

            # Clean up
            os.remove(temp_path)
            return video_data

        except Exception as e:
            logger.error(f"Text-to-video generation failed: {str(e)}")
            raise

    async def _generate_from_image(self, request: VideoRequest) -> bytes:
        """Generate video from source image."""
        try:
            # Decode base64 image
            import base64
            from PIL import Image
            import io

            image_data = base64.b64decode(request.source_image)
            image = Image.open(io.BytesIO(image_data))

            # Generate video
            outputs = self.image_to_video(
                image=image,
                num_frames=self.config['generation']['image_to_video']['frames'],
                fps=request.fps,
                motion_bucket_id=self.config['generation']['image_to_video']['motion_bucket_id']
            ).frames

            # Convert frames to video
            frames = [np.array(frame) for frame in outputs]
            clip = ImageSequenceClip(frames, fps=request.fps)

            # Save to temporary file
            temp_path = f"/tmp/video_{datetime.now().timestamp()}.mp4"
            clip.write_videofile(
                temp_path,
                codec='libx264',
                fps=request.fps,
                audio=False
            )

            # Read file and return bytes
            with open(temp_path, 'rb') as f:
                video_data = f.read()

            # Clean up
            os.remove(temp_path)
            return video_data

        except Exception as e:
            logger.error(f"Image-to-video generation failed: {str(e)}")
            raise

    async def _check_video_quality(self, video_data: bytes) -> bool:
        """Check if video meets quality requirements."""
        try:
            # Save to temporary file for checking
            temp_path = f"/tmp/check_{datetime.now().timestamp()}.mp4"
            with open(temp_path, 'wb') as f:
                f.write(video_data)

            # Open video
            cap = cv2.VideoCapture(temp_path)
            
            # Check resolution
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            
            min_width = self.config['quality']['min_resolution']['width']
            min_height = self.config['quality']['min_resolution']['height']
            min_fps = self.config['quality']['min_fps']
            
            if width < min_width or height < min_height:
                logger.warning(f"Video resolution {width}x{height} below minimum {min_width}x{min_height}")
                return False
                
            if fps < min_fps:
                logger.warning(f"Video FPS {fps} below minimum {min_fps}")
                return False

            # Check file size
            file_size = len(video_data) / (1024 * 1024)  # Convert to MB
            if file_size > self.config['quality']['max_file_size_mb']:
                logger.warning(f"Video size {file_size}MB exceeds maximum {self.config['quality']['max_file_size_mb']}MB")
                return False

            # Clean up
            cap.release()
            os.remove(temp_path)
            
            return True

        except Exception as e:
            logger.error(f"Error checking video quality: {str(e)}")
            return False

    async def _save_video(self, video_data: bytes, request: VideoRequest) -> str:
        """Save video to Cloud Storage and return public URL."""
        try:
            # Create unique filename
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{os.urandom(4).hex()}.mp4"
            blob_name = os.path.join(
                self.config['storage']['videos_prefix'],
                filename
            )

            # Get bucket
            bucket = self.storage_client.bucket(self.config['storage']['bucket'])
            blob = bucket.blob(blob_name)

            # Upload video
            blob.upload_from_string(
                video_data,
                content_type='video/mp4'
            )

            # Make public and return URL
            blob.make_public()
            return blob.public_url

        except Exception as e:
            logger.error(f"Error saving video: {str(e)}")
            raise

    async def publish_result(self, result: Dict[str, Any]) -> None:
        """Publish generation result to Pub/Sub."""
        try:
            topic_path = self.publisher.topic_path(
                os.getenv('GOOGLE_CLOUD_PROJECT'),
                self.config['pubsub']['output_topic']
            )

            data = json.dumps(result).encode('utf-8')
            future = self.publisher.publish(topic_path, data)
            await asyncio.wrap_future(future)

        except Exception as e:
            logger.error(f"Error publishing result: {str(e)}")
            raise

# Initialize service
service = VideoGenerationService()

@app.post("/generate")
async def generate_video(
    request: VideoRequest,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """Generate video endpoint."""
    try:
        result = await service.generate_video(request)
        return result
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    } 