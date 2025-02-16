import os
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import stability_sdk.interfaces.gooseai.generation.generation_pb2 as generation
from stability_sdk import client
import replicate
from google.cloud import storage, vision, pubsub_v1
from PIL import Image
import io
import logging
from logging_config import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)

app = FastAPI()

class ImageRequest(BaseModel):
    """Request model for image generation."""
    prompt: str = Field(..., min_length=1, max_length=1000)
    style: Optional[str] = Field(default="realistic")
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    num_images: int = Field(default=1, ge=1, le=4)

class VisualGenerationService:
    def __init__(self):
        self._load_config()
        self._initialize_clients()
        logger.info("Visual Generation Service initialized")

    def _load_config(self) -> Dict[str, Any]:
        """Load service configuration."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '../config/visual-generation-config.json'
        )
        with open(config_path) as f:
            self.config = json.load(f)
        return self.config

    def _initialize_clients(self):
        """Initialize API clients."""
        # Initialize Stability AI client
        if self.config['generation']['stability_ai']['enabled']:
            self.stability_api = client.StabilityInference(
                key=os.environ['STABILITY_API_KEY'],
                verbose=True,
            )

        # Initialize Replicate client
        if self.config['generation']['replicate']['enabled']:
            self.replicate_client = replicate.Client(
                api_token=os.environ['REPLICATE_API_TOKEN']
            )

        # Initialize Google Cloud clients
        self.storage_client = storage.Client()
        self.vision_client = vision.ImageAnnotatorClient()
        self.publisher = pubsub_v1.PublisherClient()

    async def generate_images(self, request: ImageRequest) -> List[Dict[str, Any]]:
        """Generate images based on the request."""
        try:
            # Try Stability AI first
            if self.config['generation']['stability_ai']['enabled']:
                images = await self._generate_with_stability(request)
                if images:
                    return images

            # Fallback to Replicate
            if self.config['generation']['replicate']['enabled']:
                images = await self._generate_with_replicate(request)
                if images:
                    return images

            raise Exception("All image generation attempts failed")

        except Exception as e:
            logger.error(f"Error generating images: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Image generation failed: {str(e)}"
            )

    async def _generate_with_stability(self, request: ImageRequest) -> List[Dict[str, Any]]:
        """Generate images using Stability AI."""
        try:
            answers = self.stability_api.generate(
                prompt=request.prompt,
                width=request.width,
                height=request.height,
                samples=request.num_images,
                steps=self.config['generation']['stability_ai']['steps'],
                cfg_scale=self.config['generation']['stability_ai']['cfg_scale'],
            )

            images = []
            for resp in answers:
                for artifact in resp.artifacts:
                    if artifact.finish_reason == generation.FILTER:
                        logger.warning("Content filtered by safety system")
                        continue

                    image_data = artifact.binary
                    image_url = await self._save_image(image_data)
                    
                    images.append({
                        'url': image_url,
                        'metadata': {
                            'prompt': request.prompt,
                            'style': request.style,
                            'width': request.width,
                            'height': request.height,
                            'generated_at': datetime.utcnow().isoformat(),
                            'model': 'stability-ai',
                        }
                    })

            return images

        except Exception as e:
            logger.error(f"Stability AI generation failed: {str(e)}")
            return []

    async def _generate_with_replicate(self, request: ImageRequest) -> List[Dict[str, Any]]:
        """Generate images using Replicate."""
        try:
            output = self.replicate_client.run(
                self.config['generation']['replicate']['model'] + ":" +
                self.config['generation']['replicate']['version'],
                input={
                    "prompt": request.prompt,
                    "width": request.width,
                    "height": request.height,
                    "num_outputs": request.num_images,
                }
            )

            images = []
            for image_url in output:
                # Download image from Replicate URL
                async with httpx.AsyncClient() as client:
                    response = await client.get(image_url)
                    image_data = response.content

                # Save to our storage
                final_url = await self._save_image(image_data)
                
                images.append({
                    'url': final_url,
                    'metadata': {
                        'prompt': request.prompt,
                        'style': request.style,
                        'width': request.width,
                        'height': request.height,
                        'generated_at': datetime.utcnow().isoformat(),
                        'model': 'replicate',
                    }
                })

            return images

        except Exception as e:
            logger.error(f"Replicate generation failed: {str(e)}")
            return []

    async def _save_image(self, image_data: bytes) -> str:
        """Save image to Cloud Storage and return public URL."""
        try:
            # Create unique filename
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{os.urandom(4).hex()}.png"
            blob_name = os.path.join(
                self.config['storage']['images_prefix'],
                filename
            )

            # Get bucket
            bucket = self.storage_client.bucket(self.config['storage']['bucket'])
            blob = bucket.blob(blob_name)

            # Upload image
            blob.upload_from_string(
                image_data,
                content_type='image/png'
            )

            # Make public and return URL
            blob.make_public()
            return blob.public_url

        except Exception as e:
            logger.error(f"Error saving image: {str(e)}")
            raise

    async def _check_image_quality(self, image_data: bytes) -> bool:
        """Check if image meets quality requirements."""
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Check resolution
            width, height = image.size
            min_width = self.config['quality']['min_resolution']['width']
            min_height = self.config['quality']['min_resolution']['height']
            
            if width < min_width or height < min_height:
                logger.warning(f"Image resolution {width}x{height} below minimum {min_width}x{min_height}")
                return False

            # Check file size
            image_size = len(image_data) / (1024 * 1024)  # Convert to MB
            if image_size > self.config['quality']['max_file_size_mb']:
                logger.warning(f"Image size {image_size}MB exceeds maximum {self.config['quality']['max_file_size_mb']}MB")
                return False

            # Check format
            if image.format.lower() not in self.config['quality']['required_formats']:
                logger.warning(f"Image format {image.format} not in required formats")
                return False

            return True

        except Exception as e:
            logger.error(f"Error checking image quality: {str(e)}")
            return False

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
service = VisualGenerationService()

@app.post("/generate")
async def generate_images(
    request: ImageRequest,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """Generate images endpoint."""
    try:
        images = await service.generate_images(request)
        
        result = {
            'status': 'success',
            'images': images,
            'metadata': {
                'prompt': request.prompt,
                'style': request.style,
                'generated_at': datetime.utcnow().isoformat(),
            }
        }

        # Publish result in background
        background_tasks.add_task(service.publish_result, result)

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