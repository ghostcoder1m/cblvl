import pytest
import json
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from google.cloud import texttospeech_v1
import numpy as np
import soundfile as sf
import io

from src.main import app, AudioRequest, AudioGenerationService
from src.utils import (
    generate_unique_filename,
    check_audio_quality,
    validate_audio_format,
    calculate_chunk_size,
    format_duration
)

# Test client setup
client = TestClient(app)

# Mock data
SAMPLE_TEXT = "This is a test text for audio generation."
MOCK_AUDIO_CONTENT = b"mock_audio_content"
MOCK_AUDIO_URL = "https://storage.googleapis.com/bucket/audio/test.mp3"

@pytest.fixture
def mock_tts_response():
    """Mock Google Cloud TTS response."""
    response = MagicMock()
    response.audio_content = MOCK_AUDIO_CONTENT
    return response

@pytest.fixture
def mock_storage_blob():
    """Mock Google Cloud Storage blob."""
    blob = MagicMock()
    blob.public_url = MOCK_AUDIO_URL
    return blob

@pytest.fixture
def mock_bucket(mock_storage_blob):
    """Mock Google Cloud Storage bucket."""
    bucket = MagicMock()
    bucket.blob.return_value = mock_storage_blob
    return bucket

@pytest.fixture
def mock_storage_client(mock_bucket):
    """Mock Google Cloud Storage client."""
    client = MagicMock()
    client.bucket.return_value = mock_bucket
    return client

@pytest.fixture
def mock_publisher():
    """Mock Pub/Sub publisher."""
    publisher = MagicMock()
    future = MagicMock()
    future.result.return_value = "message_id"
    publisher.publish.return_value = future
    return publisher

# AudioRequest model tests
def test_audio_request_validation():
    """Test AudioRequest model validation."""
    # Test valid request
    request = AudioRequest(
        text=SAMPLE_TEXT,
        language_code="en-US",
        voice_name="en-US-Neural2-D",
        output_format="mp3",
        speaking_rate=1.0,
        pitch=0.0
    )
    assert request.text == SAMPLE_TEXT
    assert request.language_code == "en-US"
    
    # Test empty text
    with pytest.raises(ValueError):
        AudioRequest(text="", language_code="en-US")
    
    # Test invalid speaking rate
    with pytest.raises(ValueError):
        AudioRequest(text=SAMPLE_TEXT, speaking_rate=0.1)
    
    # Test invalid pitch
    with pytest.raises(ValueError):
        AudioRequest(text=SAMPLE_TEXT, pitch=30.0)

# Utility function tests
def test_generate_unique_filename():
    """Test unique filename generation."""
    text = "Test audio file"
    format = "mp3"
    
    filename = generate_unique_filename(text, format)
    
    assert filename.endswith(".mp3")
    assert "test_audio_file" in filename
    assert len(filename.split("_")) >= 3  # timestamp, text, uuid

def test_check_audio_quality():
    """Test audio quality checking."""
    # Create test audio data
    sample_rate = 44100
    duration = 1.0  # seconds
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio_data = np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
    
    # Convert to bytes
    buffer = io.BytesIO()
    sf.write(buffer, audio_data, sample_rate, format='WAV')
    audio_bytes = buffer.getvalue()
    
    # Test quality check
    passed, metrics = check_audio_quality(audio_bytes, sample_rate)
    
    assert passed
    assert 'duration' in metrics
    assert 'sample_rate' in metrics
    assert 'max_amplitude' in metrics
    assert not metrics['is_silent']

def test_validate_audio_format():
    """Test audio format validation."""
    assert validate_audio_format("mp3")
    assert validate_audio_format("wav")
    assert validate_audio_format("ogg")
    assert validate_audio_format("flac")
    assert not validate_audio_format("invalid")

def test_calculate_chunk_size():
    """Test text chunking."""
    text = "First sentence. Second sentence. Third sentence."
    max_chars = 20
    
    chunks = calculate_chunk_size(text, max_chars)
    
    assert all(len(chunk) <= max_chars for chunk in chunks)
    assert "".join(chunks).replace(" ", "") == text.replace(" ", "")

def test_format_duration():
    """Test duration formatting."""
    assert format_duration(65) == "01:05"
    assert format_duration(3665) == "01:01:05"
    assert format_duration(45) == "00:45"

# API endpoint tests
@pytest.mark.asyncio
async def test_generate_audio_endpoint(
    mock_tts_response,
    mock_storage_client,
    mock_publisher
):
    """Test the generate-audio endpoint."""
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock_tts_client:
        mock_tts_client.return_value.synthesize_speech.return_value = mock_tts_response
        
        response = client.post(
            "/generate-audio",
            json={
                "text": SAMPLE_TEXT,
                "language_code": "en-US",
                "voice_name": "en-US-Neural2-D",
                "output_format": "mp3"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "audio_url" in data
        assert "metadata" in data
        assert data["metadata"]["text"] == SAMPLE_TEXT

@pytest.mark.asyncio
async def test_generate_audio_error_handling(
    mock_tts_response,
    mock_storage_client,
    mock_publisher
):
    """Test error handling in the generate-audio endpoint."""
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock_tts_client:
        # Simulate TTS error
        mock_tts_client.return_value.synthesize_speech.side_effect = Exception("TTS error")
        
        # Simulate fallback error
        with patch('pyttsx3.init') as mock_pyttsx3:
            mock_pyttsx3.side_effect = Exception("Fallback error")
            
            response = client.post(
                "/generate-audio",
                json={
                    "text": SAMPLE_TEXT,
                    "language_code": "en-US"
                }
            )
            
            assert response.status_code == 500
            assert "Audio generation failed" in response.json()["detail"]

@pytest.mark.asyncio
async def test_health_check():
    """Test the health check endpoint."""
    response = client.get("/health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data

# Service class tests
@pytest.mark.asyncio
async def test_audio_generation_service(
    mock_tts_response,
    mock_storage_client,
    mock_publisher
):
    """Test AudioGenerationService functionality."""
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock_tts_client:
        mock_tts_client.return_value.synthesize_speech.return_value = mock_tts_response
        
        service = AudioGenerationService()
        request = AudioRequest(
            text=SAMPLE_TEXT,
            language_code="en-US",
            voice_name="en-US-Neural2-D",
            output_format="mp3"
        )
        
        result = await service.generate_audio(request)
        
        assert result["status"] == "success"
        assert result["audio_url"] == MOCK_AUDIO_URL
        assert result["metadata"]["text"] == SAMPLE_TEXT
        assert not result["metadata"]["used_fallback"]

@pytest.mark.asyncio
async def test_fallback_generation(
    mock_storage_client,
    mock_publisher
):
    """Test fallback audio generation."""
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock_tts_client:
        # Simulate TTS error
        mock_tts_client.return_value.synthesize_speech.side_effect = Exception("TTS error")
        
        # Mock fallback engine
        with patch('pyttsx3.init') as mock_pyttsx3:
            mock_engine = MagicMock()
            mock_pyttsx3.return_value = mock_engine
            
            service = AudioGenerationService()
            request = AudioRequest(
                text=SAMPLE_TEXT,
                language_code="en-US"
            )
            
            result = await service.generate_audio(request)
            
            assert result["status"] == "success"
            assert result["metadata"]["used_fallback"]
            mock_engine.save_to_file.assert_called_once()
            mock_engine.runAndWait.assert_called_once() 