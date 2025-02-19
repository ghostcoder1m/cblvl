from fastapi import FastAPI, WebSocket, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import google.generativeai as genai
from google.cloud import texttospeech, storage
import logging
import json
import os
import uuid
import asyncio
from PIL import Image
import io
import tempfile
import ffmpeg
from moviepy.editor import VideoFileClip, AudioFileClip, ImageSequenceClip

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Video Generation Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
active_connections: Dict[str, WebSocket] = {}

# Initialize Google AI
genai.configure(api_key=os.getenv('GOOGLE_AI_API_KEY'))
model = genai.GenerativeModel('gemini-pro')

class VideoRequest(BaseModel):
    taskId: str
    trends: List[str]
    format: str
    style: str
    targetAudience: str
    duration: str
    prompt: str
    additionalInstructions: Optional[str] = None
    width: int = Field(default=1920)
    height: int = Field(default=1080)
    fps: int = Field(default=30)

class VideoGenerationService:
    def __init__(self):
        self.storage_client = storage.Client()
        self.tts_client = texttospeech.TextToSpeechClient()
        self.bucket_name = os.getenv('GOOGLE_CLOUD_STORAGE_BUCKET', 'your-bucket-name')

    async def generate_script(self, prompt: str, style: str, target_audience: str) -> str:
        try:
            prompt_template = f"""
            Create a script for a {style} video targeting {target_audience}.
            Topic: {prompt}
            Make it engaging and suitable for the target audience.
            Keep it concise and impactful.
            """
            
            response = model.generate_content(prompt_template)
            return response.text
        except Exception as e:
            logger.error(f"Script generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Script generation failed: {str(e)}")

    async def generate_voice_over(self, script: str) -> bytes:
        try:
            synthesis_input = texttospeech.SynthesisInput(text=script)
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name="en-US-Neural2-D"
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )

            response = self.tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )

            return response.audio_content
        except Exception as e:
            logger.error(f"Voice-over generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Voice-over generation failed: {str(e)}")

    async def generate_images(self, script: str, num_images: int = 5) -> List[str]:
        try:
            # For now, create placeholder images
            image_paths = []
            for i in range(num_images):
                img = Image.new('RGB', (1920, 1080), color=f'hsl({i * 360 / num_images}, 50%, 50%)')
                temp_path = f"/tmp/image_{i}.jpg"
                img.save(temp_path)
                image_paths.append(temp_path)
            return image_paths
        except Exception as e:
            logger.error(f"Image generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

    async def create_video(self, image_paths: List[str], voice_over_path: str, output_path: str, fps: int) -> str:
        try:
            # Create video from images
            clip = ImageSequenceClip(image_paths, fps=fps)
            
            # Load the audio file
            audio = AudioFileClip(voice_over_path)
            
            # Set the video duration to match the audio duration
            video = clip.set_duration(audio.duration)
            
            # Combine video with audio
            final_clip = video.set_audio(audio)
            
            # Write the final video file
            final_clip.write_videofile(output_path, codec='libx264', audio_codec='aac')
            
            # Close the clips to free up resources
            final_clip.close()
            audio.close()
            clip.close()

            return output_path
        except Exception as e:
            logger.error(f"Video creation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Video creation failed: {str(e)}")

    async def upload_to_storage(self, file_path: str, task_id: str) -> str:
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            blob_name = f"videos/{task_id}/output.mp4"
            blob = bucket.blob(blob_name)
            
            blob.upload_from_filename(file_path)
            
            return blob.public_url
        except Exception as e:
            logger.error(f"Upload error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

async def update_progress(websocket: WebSocket, progress: float, status: str, error: Optional[str] = None):
    try:
        await websocket.send_json({
            "progress": progress,
            "status": status,
            "error": error
        })
    except Exception as e:
        logger.error(f"WebSocket update error: {str(e)}")

@app.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    await websocket.accept()
    active_connections[task_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        if task_id in active_connections:
            del active_connections[task_id]

@app.post("/generate")
async def generate_video(request: VideoRequest, background_tasks: BackgroundTasks):
    service = VideoGenerationService()
    
    try:
        # Update initial status
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 0, "starting", None)

        # Generate script
        script = await service.generate_script(request.prompt, request.style, request.targetAudience)
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 20, "script_generated", None)

        # Generate voice-over
        voice_over = await service.generate_voice_over(script)
        voice_over_path = f"/tmp/{request.taskId}_voice.mp3"
        with open(voice_over_path, "wb") as f:
            f.write(voice_over)
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 40, "voice_generated", None)

        # Generate images
        image_paths = await service.generate_images(script)
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 60, "images_generated", None)

        # Create video
        output_path = f"/tmp/{request.taskId}_output.mp4"
        await service.create_video(image_paths, voice_over_path, output_path, request.fps)
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 80, "video_created", None)

        # Upload to storage
        video_url = await service.upload_to_storage(output_path, request.taskId)
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 100, "completed", None)

        # Clean up temporary files
        os.remove(voice_over_path)
        os.remove(output_path)
        for path in image_paths:
            os.remove(path)

        return {"status": "success", "videoUrl": video_url}
    except Exception as e:
        error_message = str(e)
        logger.error(f"Video generation error: {error_message}")
        if request.taskId in active_connections:
            await update_progress(active_connections[request.taskId], 0, "failed", error_message)
        raise HTTPException(status_code=500, detail=error_message)

@app.get("/health")
async def health_check():
    return {"status": "healthy"} 