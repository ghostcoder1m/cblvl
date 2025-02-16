import pytest
import json
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from google.cloud import texttospeech_v1, storage, pubsub_v1

from src.main import AudioGenerationService, AudioRequest

@pytest.fixture(scope="module")
def mock_tts_client():
    with patch('google.cloud.texttospeech_v1.TextToSpeechClient') as mock:
        client = mock.return_value
        client.synthesize_speech = MagicMock()
        response = MagicMock()
        response.audio_content = b'test_audio_content'
        client.synthesize_speech.return_value = response
        yield client

@pytest.fixture(scope="module")
def mock_storage_client():
    with patch('google.cloud.storage.Client') as mock:
        client = mock.return_value
        bucket = MagicMock()
        blob = MagicMock()
        bucket.blob.return_value = blob
        client.bucket.return_value = bucket
        yield client

@pytest.fixture(scope="module")
def mock_publisher():
    with patch('google.cloud.pubsub_v1.PublisherClient') as mock:
        publisher = mock.return_value
        publisher.publish = MagicMock()
        future = MagicMock()
        future.result.return_value = None
        publisher.publish.return_value = future
        yield publisher

@pytest.mark.asyncio
async def test_end_to_end_flow(mock_tts_client, mock_storage_client, mock_publisher):
    """Test the complete flow from request to audio generation and storage."""
    service = AudioGenerationService()
    
    # Test data
    request = AudioRequest(
        text="This is a test article that needs to be converted to audio.",
        language_code="en-US",
        voice_name="en-US-Neural2-D",
        output_format="mp3"
    )
    
    # Process the request
    response = await service.generate_audio(request)
    
    # Verify response structure
    assert response["status"] == "success"
    assert "audio_url" in response
    assert "metadata" in response
    assert response["metadata"]["text"].startswith("This is a test article")
    assert response["metadata"]["language"] == "en-US"
    assert response["metadata"]["format"] == "mp3"
    
    # Verify TTS was called with correct parameters
    tts_calls = mock_tts_client.synthesize_speech.call_args_list
    assert len(tts_calls) == 1
    args, kwargs = tts_calls[0]
    
    assert isinstance(args[0], texttospeech_v1.SynthesisInput)
    assert args[0].text == request.text
    
    # Verify storage operations
    storage_calls = mock_storage_client.bucket().blob.call_args_list
    assert len(storage_calls) == 1
    args, kwargs = storage_calls[0]
    assert args[0].startswith("audio/")
    assert args[0].endswith(".mp3")
    
    # Verify Pub/Sub publish
    publish_calls = mock_publisher.publish.call_args_list
    assert len(publish_calls) == 1
    args, kwargs = publish_calls[0]
    published_data = json.loads(args[1].decode('utf-8'))
    assert published_data["text"].startswith("This is a test article")
    assert published_data["language"] == "en-US"
    assert published_data["format"] == "mp3"

@pytest.mark.asyncio
async def test_fallback_integration(mock_tts_client, mock_storage_client, mock_publisher):
    """Test the fallback mechanism integration."""
    service = AudioGenerationService()
    
    # Make Cloud TTS fail
    mock_tts_client.synthesize_speech.side_effect = Exception("TTS error")
    
    with patch('pyttsx3.init') as mock_pyttsx3:
        engine = MagicMock()
        mock_pyttsx3.return_value = engine
        
        request = AudioRequest(
            text="This text should be processed by the fallback engine.",
            language_code="en-US"
        )
        
        response = await service.generate_audio(request)
        
        # Verify response indicates fallback was used
        assert response["status"] == "success"
        assert response.get("used_fallback", False)
        assert "audio_url" in response
        
        # Verify fallback engine was used correctly
        engine.setProperty.assert_called()  # Check properties were set
        engine.save_to_file.assert_called_once()
        engine.runAndWait.assert_called_once()
        
        # Verify storage operations still occurred
        storage_calls = mock_storage_client.bucket().blob.call_args_list
        assert len(storage_calls) > 0
        args, kwargs = storage_calls[-1]
        assert "fallback" in args[0]
        
        # Verify Pub/Sub still published
        publish_calls = mock_publisher.publish.call_args_list
        assert len(publish_calls) > 0
        args, kwargs = publish_calls[-1]
        published_data = json.loads(args[1].decode('utf-8'))
        assert published_data.get("used_fallback", False)

@pytest.mark.asyncio
async def test_error_handling_integration(mock_tts_client, mock_storage_client, mock_publisher):
    """Test error handling in the integration flow."""
    service = AudioGenerationService()
    
    # Make everything fail
    mock_tts_client.synthesize_speech.side_effect = Exception("TTS error")
    mock_storage_client.bucket().blob.side_effect = Exception("Storage error")
    mock_publisher.publish.side_effect = Exception("Pub/Sub error")
    
    with patch('pyttsx3.init') as mock_pyttsx3:
        mock_pyttsx3.side_effect = Exception("Fallback error")
        
        request = AudioRequest(text="This should trigger all error handlers.")
        
        with pytest.raises(Exception) as exc_info:
            await service.generate_audio(request)
        
        assert "Audio generation failed" in str(exc_info.value)

@pytest.mark.asyncio
async def test_quality_check_integration(mock_tts_client, mock_storage_client, mock_publisher):
    """Test quality checking integration."""
    service = AudioGenerationService()
    
    # Mock audio data with different quality levels
    good_audio = b'good_audio_content'
    bad_audio = b'bad_audio_content'
    
    with patch('soundfile.read') as mock_sf_read:
        # Test with good quality audio
        mock_sf_read.return_value = ([0.1, 0.2, 0.3], 44100)  # Good sample rate
        mock_tts_client.synthesize_speech.return_value.audio_content = good_audio
        
        response = await service.generate_audio(AudioRequest(text="Good quality test"))
        assert response["status"] == "success"
        
        # Test with poor quality audio
        mock_sf_read.return_value = ([0.1, 0.2, 0.3], 8000)  # Poor sample rate
        mock_tts_client.synthesize_speech.return_value.audio_content = bad_audio
        
        # Should still succeed but might log warnings
        response = await service.generate_audio(AudioRequest(text="Poor quality test"))
        assert response["status"] == "success" 