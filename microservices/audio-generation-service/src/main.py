import os
import time
import json
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from google.cloud import texttospeech_v1
import pyttsx3
import io

from .logging_config import get_logger_with_context, MetricsLogger
from .utils import (
    generate_unique_filename,
    check_audio_quality,
    upload_to_storage,
    publish_message,
    get_content_type,
    validate_audio_format,
    calculate_chunk_size,
    format_duration
)

# Initialize FastAPI app
app = FastAPI(title="Audio Generation Service")

# Initialize logger
logger = get_logger_with_context(__name__)
metrics_logger = MetricsLogger(logger)

# Load configuration
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT')
STORAGE_BUCKET = os.getenv('STORAGE_BUCKET')
STORAGE_PREFIX = os.getenv('STORAGE_PREFIX', 'audio/')
PUBSUB_OUTPUT_TOPIC = os.getenv('PUBSUB_OUTPUT_TOPIC')
TTS_LANGUAGE_CODE = os.getenv('TTS_LANGUAGE_CODE', 'en-US')
TTS_VOICE_NAME = os.getenv('TTS_VOICE_NAME', 'en-US-Neural2-D')
TTS_SPEAKING_RATE = float(os.getenv('TTS_SPEAKING_RATE', '1.0'))
TTS_PITCH = float(os.getenv('TTS_PITCH', '0.0'))
TTS_SAMPLE_RATE = int(os.getenv('TTS_SAMPLE_RATE', '24000'))

class AudioRequest(BaseModel):
    """Request model for audio generation."""
    text: str = Field(..., min_length=1, description="Text to convert to audio")
    language_code: str = Field(default=TTS_LANGUAGE_CODE, description="Language code")
    voice_name: str = Field(default=TTS_VOICE_NAME, description="Voice name")
    output_format: str = Field(default="mp3", description="Output audio format")
    speaking_rate: float = Field(default=TTS_SPEAKING_RATE, ge=0.25, le=4.0)
    pitch: float = Field(default=TTS_PITCH, ge=-20.0, le=20.0)

class AudioGenerationService:
    """Service for generating audio from text."""
    
    def __init__(self):
        self.tts_client = texttospeech_v1.TextToSpeechClient()
        self.fallback_engine = None
    
    async def generate_audio(self, request: AudioRequest) -> Dict[str, Any]:
        """Generate audio from text using Google Cloud TTS or fallback to local TTS.
        
        Args:
            request: The audio generation request
            
        Returns:
            Dictionary containing the generation results
        """
        start_time = time.time()
        used_fallback = False
        error = None
        
        try:
            # Validate audio format
            if not validate_audio_format(request.output_format):
                raise ValueError(f"Unsupported audio format: {request.output_format}")
            
            # Try Google Cloud TTS first
            try:
                audio_content = await self._generate_cloud_tts(request)
            except Exception as e:
                logger.warning(f"Cloud TTS failed, falling back to local TTS: {str(e)}")
                audio_content = await self._generate_local_tts(request)
                used_fallback = True
            
            # Check audio quality
            passed_quality, quality_metrics = check_audio_quality(
                audio_content, TTS_SAMPLE_RATE
            )
            
            if not passed_quality:
                logger.warning("Audio quality check failed", extra=quality_metrics)
            
            # Generate filename and upload to storage
            filename = generate_unique_filename(request.text, request.output_format)
            blob_name = os.path.join(STORAGE_PREFIX, filename)
            content_type = get_content_type(request.output_format)
            
            audio_url = upload_to_storage(
                STORAGE_BUCKET, blob_name, audio_content, content_type
            )
            
            # Prepare metadata
            metadata = {
                'text': request.text,
                'language': request.language_code,
                'voice': request.voice_name,
                'format': request.output_format,
                'duration': quality_metrics.get('duration'),
                'sample_rate': quality_metrics.get('sample_rate'),
                'used_fallback': used_fallback,
                'quality_metrics': quality_metrics,
                'created_at': datetime.utcnow().isoformat()
            }
            
            # Publish metadata to Pub/Sub
            if PUBSUB_OUTPUT_TOPIC:
                publish_message(PROJECT_ID, PUBSUB_OUTPUT_TOPIC, metadata)
            
            duration_ms = int((time.time() - start_time) * 1000)
            metrics_logger.log_audio_generation_metrics(
                duration_ms=duration_ms,
                success=True,
                used_fallback=used_fallback,
                audio_quality=quality_metrics
            )
            
            return {
                'status': 'success',
                'audio_url': audio_url,
                'metadata': metadata
            }
            
        except Exception as e:
            error = str(e)
            logger.error(f"Audio generation failed: {error}")
            duration_ms = int((time.time() - start_time) * 1000)
            metrics_logger.log_audio_generation_metrics(
                duration_ms=duration_ms,
                success=False,
                error=error
            )
            raise HTTPException(status_code=500, detail=f"Audio generation failed: {error}")
    
    async def _generate_cloud_tts(self, request: AudioRequest) -> bytes:
        """Generate audio using Google Cloud Text-to-Speech.
        
        Args:
            request: The audio generation request
            
        Returns:
            Generated audio content as bytes
        """
        # Prepare the input
        synthesis_input = texttospeech_v1.SynthesisInput(text=request.text)
        
        # Configure voice parameters
        voice = texttospeech_v1.VoiceSelectionParams(
            language_code=request.language_code,
            name=request.voice_name
        )
        
        # Configure audio parameters
        audio_config = texttospeech_v1.AudioConfig(
            audio_encoding=texttospeech_v1.AudioEncoding[request.output_format.upper()],
            speaking_rate=request.speaking_rate,
            pitch=request.pitch,
            sample_rate_hertz=TTS_SAMPLE_RATE
        )
        
        # Perform the text-to-speech request
        response = await asyncio.to_thread(
            self.tts_client.synthesize_speech,
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        
        return response.audio_content
    
    async def _generate_local_tts(self, request: AudioRequest) -> bytes:
        """Generate audio using local TTS engine (pyttsx3).
        
        Args:
            request: The audio generation request
            
        Returns:
            Generated audio content as bytes
        """
        if self.fallback_engine is None:
            self.fallback_engine = pyttsx3.init()
        
        # Configure voice properties
        self.fallback_engine.setProperty('rate', int(request.speaking_rate * 200))  # Approximate mapping
        self.fallback_engine.setProperty('volume', 1.0)
        
        # Create a temporary file to store the audio
        temp_file = io.BytesIO()
        
        def save_to_buffer():
            self.fallback_engine.save_to_file(request.text, temp_file)
            self.fallback_engine.runAndWait()
        
        # Run in executor to avoid blocking
        await asyncio.to_thread(save_to_buffer)
        
        return temp_file.getvalue()

# Initialize service
audio_service = AudioGenerationService()

@app.post("/generate-audio")
async def generate_audio(request: AudioRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """API endpoint to generate audio from text.
    
    Args:
        request: The audio generation request
        background_tasks: FastAPI background tasks
        
    Returns:
        Dictionary containing the generation results
    """
    return await audio_service.generate_audio(request)

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint.
    
    Returns:
        Dictionary containing health status
    """
    return {
        'status': 'healthy',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 