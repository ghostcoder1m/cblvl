import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import json
import os
from main import app, VisualGenerationService

# Create test client
client = TestClient(app)

# Mock configuration
@pytest.fixture
def mock_config():
    return {
        'generation': {
            'stability_ai': {
                'enabled': True,
                'steps': 30,
                'cfg_scale': 7.5
            },
            'replicate': {
                'enabled': True,
                'model': 'stability-ai/stable-diffusion',
                'version': 'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf'
            }
        },
        'storage': {
            'bucket': 'test-bucket',
            'images_prefix': 'generated-images'
        },
        'pubsub': {
            'output_topic': 'image-generation-results'
        },
        'quality': {
            'min_resolution': {'width': 512, 'height': 512},
            'max_file_size_mb': 10,
            'required_formats': ['png', 'jpg', 'jpeg']
        }
    }

@pytest.fixture
def mock_service(mock_config):
    with patch.object(VisualGenerationService, '_load_config', return_value=mock_config):
        with patch.object(VisualGenerationService, '_initialize_clients'):
            yield VisualGenerationService()

def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()['status'] == 'healthy'
    assert 'timestamp' in response.json()

@pytest.mark.asyncio
async def test_generate_images_stability(mock_service):
    """Test image generation with Stability AI."""
    # Mock Stability AI response
    mock_artifact = MagicMock()
    mock_artifact.binary = b"fake_image_data"
    mock_artifact.finish_reason = "COMPLETE"
    
    mock_response = MagicMock()
    mock_response.artifacts = [mock_artifact]
    
    mock_service.stability_api = MagicMock()
    mock_service.stability_api.generate.return_value = [mock_response]
    
    # Mock image saving
    mock_service._save_image = MagicMock()
    mock_service._save_image.return_value = "https://storage.googleapis.com/test-bucket/test-image.png"
    
    # Mock Pub/Sub publishing
    mock_service.publish_result = MagicMock()
    
    # Test request
    request_data = {
        "prompt": "a beautiful sunset",
        "style": "realistic",
        "width": 1024,
        "height": 1024,
        "num_images": 1
    }
    
    response = await client.post("/generate", json=request_data)
    assert response.status_code == 200
    
    result = response.json()
    assert result['status'] == 'success'
    assert len(result['images']) == 1
    assert result['images'][0]['url'] == "https://storage.googleapis.com/test-bucket/test-image.png"
    assert result['images'][0]['metadata']['prompt'] == request_data['prompt']
    assert result['images'][0]['metadata']['model'] == 'stability-ai'

@pytest.mark.asyncio
async def test_generate_images_replicate(mock_service):
    """Test image generation with Replicate."""
    # Disable Stability AI
    mock_service.config['generation']['stability_ai']['enabled'] = False
    
    # Mock Replicate response
    mock_service.replicate_client = MagicMock()
    mock_service.replicate_client.run.return_value = ["https://replicate.com/test-image.png"]
    
    # Mock image saving
    mock_service._save_image = MagicMock()
    mock_service._save_image.return_value = "https://storage.googleapis.com/test-bucket/test-image.png"
    
    # Mock Pub/Sub publishing
    mock_service.publish_result = MagicMock()
    
    # Test request
    request_data = {
        "prompt": "a beautiful sunset",
        "style": "realistic",
        "width": 1024,
        "height": 1024,
        "num_images": 1
    }
    
    response = await client.post("/generate", json=request_data)
    assert response.status_code == 200
    
    result = response.json()
    assert result['status'] == 'success'
    assert len(result['images']) == 1
    assert result['images'][0]['url'] == "https://storage.googleapis.com/test-bucket/test-image.png"
    assert result['images'][0]['metadata']['prompt'] == request_data['prompt']
    assert result['images'][0]['metadata']['model'] == 'replicate'

def test_invalid_request():
    """Test invalid request handling."""
    # Test missing prompt
    response = client.post("/generate", json={
        "width": 1024,
        "height": 1024
    })
    assert response.status_code == 422
    
    # Test invalid dimensions
    response = client.post("/generate", json={
        "prompt": "test",
        "width": 100,  # Too small
        "height": 1024
    })
 