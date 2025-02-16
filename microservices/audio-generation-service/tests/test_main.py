import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from src.main import app, AudioGenerationService, AudioRequest

@pytest.fixture
def test_client():
    return TestClient(app)

@pytest.fixture
def mock_tts_client():
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock:
        client = mock.return_value
        client.synthesize_speech = MagicMock()
        response = MagicMock()
        response.audio_content = b'test_audio_content'
        client.synthesize_speech.return_value = response
        yield client

@pytest.fixture
def mock_storage_client():
    with patch('google.cloud.storage.Client') as mock:
        client = mock.return_value
        bucket = MagicMock()
        blob = MagicMock()
        bucket.blob.return_value = blob
        client.bucket.return_value = bucket
        yield client

@pytest.fixture
def mock_publisher():
    with patch('google.cloud.pubsub_v1.PublisherClient') as mock:
        publisher = mock.return_value
        publisher.publish = MagicMock()
        future = MagicMock()
        future.result.return_value = None
        publisher.publish.return_value = future
        yield publisher

@pytest.fixture
def audio_generation_service(mock_tts_client, mock_storage_client, mock_publisher):
    return AudioGenerationService()

def test_audio_request_validation():
    """Test AudioRequest validation."""
    # Valid request
    request = AudioRequest(text="Test text")
    assert request.text == "Test text"
    assert request.language_code == "en-US"
    assert request.output_format == "mp3"

    # Empty text
    with pytest.raises(ValueError):
        AudioRequest(text="")

    # Whitespace text
    with pytest.raises(ValueError):
        AudioRequest(text="   ")

@pytest.mark.asyncio
async def test_generate_audio_success(audio_generation_service, mock_tts_client, mock_storage_client, mock_publisher):
    """Test successful audio generation."""
    request = AudioRequest(text="Test text")
    
    response = await audio_generation_service.generate_audio(request)
    
    assert response["status"] == "success"
    assert "audio_url" in response
    assert "metadata" in response
    assert not response.get("used_fallback", False)
    
    # Verify TTS client was called
    mock_tts_client.synthesize_speech.assert_called_once()
    
    # Verify storage upload
    mock_storage_client.bucket.assert_called_once()
    mock_storage_client.bucket().blob.assert_called_once()
    mock_storage_client.bucket().blob().upload_from_string.assert_called_once()
    
    # Verify Pub/Sub publish
    mock_publisher.publish.assert_called_once()

@pytest.mark.asyncio
async def test_generate_audio_fallback(audio_generation_service, mock_tts_client, mock_storage_client, mock_publisher):
    """Test fallback to local TTS when Cloud TTS fails."""
    # Make Cloud TTS fail
    mock_tts_client.synthesize_speech.side_effect = Exception("TTS error")
    
    with patch('pyttsx3.init') as mock_pyttsx3:
        engine = MagicMock()
        mock_pyttsx3.return_value = engine
        
        request = AudioRequest(text="Test text")
        response = await audio_generation_service.generate_audio(request)
        
        assert response["status"] == "success"
        assert "audio_url" in response
        assert "metadata" in response
        assert response.get("used_fallback", False)
        
        # Verify fallback engine was used
        engine.save_to_file.assert_called_once()
        engine.runAndWait.assert_called_once()

@pytest.mark.asyncio
async def test_generate_audio_complete_failure(audio_generation_service, mock_tts_client, mock_storage_client):
    """Test complete failure when both Cloud TTS and fallback fail."""
    # Make Cloud TTS fail
    mock_tts_client.synthesize_speech.side_effect = Exception("TTS error")
    
    # Make fallback fail
    with patch('pyttsx3.init') as mock_pyttsx3:
        mock_pyttsx3.side_effect = Exception("Fallback error")
        
        request = AudioRequest(text="Test text")
        with pytest.raises(Exception):
            await audio_generation_service.generate_audio(request)

def test_api_endpoint(test_client, audio_generation_service, mock_tts_client):
    """Test the API endpoint."""
    response = test_client.post(
        "/generate",
        json={"text": "Test text"}
    )
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert "audio_url" in response.json()
    assert "metadata" in response.json()

def test_api_endpoint_invalid_request(test_client):
    """Test the API endpoint with invalid request."""
    response = test_client.post(
        "/generate",
        json={"text": ""}
    )
    
    assert response.status_code == 422  # Validation error

@pytest.mark.asyncio
async def test_audio_quality_check(audio_generation_service):
    """Test audio quality checking."""
    with patch('soundfile.read') as mock_sf_read:
        # Mock good quality audio
        mock_sf_read.return_value = (
            [0.1, 0.2, 0.3],  # Audio data
            44100  # Sample rate
        )
        
        assert audio_generation_service._check_audio_quality(b'test_audio')
        
        # Mock low sample rate
        mock_sf_read.return_value = (
            [0.1, 0.2, 0.3],
            8000  # Low sample rate
        )
        
        assert not audio_generation_service._check_audio_quality(b'test_audio')

@pytest.mark.asyncio
async def test_publish_audio(audio_generation_service, mock_publisher):
    """Test publishing audio metadata."""
    metadata = {
        "text": "Test text",
        "language": "en-US",
        "format": "mp3",
        "audio_url": "gs://bucket/audio.mp3",
        "generated_at": datetime.utcnow().isoformat()
    }
    
    await audio_generation_service.publish_audio(metadata)
    
    mock_publisher.publish.assert_called_once() 