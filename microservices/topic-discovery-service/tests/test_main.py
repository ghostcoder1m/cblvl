import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Import the app and service directly since we've handled the imports in main.py
from main import app, TopicDiscoveryService

client = TestClient(app)

@pytest.fixture
def topic_discovery_service():
    service = TopicDiscoveryService()
    return service

def test_extract_text_content(topic_discovery_service):
    # Test data
    data = {
        'social_media': [
            {'text': 'This is a test post'},
            {'text': 'Another test post'}
        ],
        'search_queries': ['test query 1', 'test query 2']
    }
    
    # Extract text content
    texts = topic_discovery_service._extract_text_content(data)
    
    # Assertions
    assert len(texts) == 4
    assert 'This is a test post' in texts
    assert 'Another test post' in texts
    assert 'test query 1' in texts
    assert 'test query 2' in texts

def test_preprocess_texts(topic_discovery_service):
    # Test data
    texts = ['This is a TEST post!', 'Another TEST post with NUMBERS 123']
    
    # Preprocess texts
    processed_texts = topic_discovery_service._preprocess_texts(texts)
    
    # Assertions
    assert len(processed_texts) == 2
    assert 'test' in processed_texts[0].lower()
    assert 'post' in processed_texts[0].lower()
    assert 'numbers' in processed_texts[1].lower()

def test_determine_category(topic_discovery_service):
    # Test different types of terms
    assert topic_discovery_service._determine_category('running') == 'action'
    assert topic_discovery_service._determine_category('happy') == 'attribute'
    assert topic_discovery_service._determine_category('computer') == 'entity'

@pytest.mark.asyncio
async def test_process_endpoint():
    # Test data
    test_data = {
        'source': 'test',
        'content': {
            'social_media': [
                {'text': 'This is a trending topic about AI'},
                {'text': 'Another post about machine learning'}
            ],
            'search_queries': ['AI trends 2024', 'machine learning applications']
        },
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Make request to the endpoint
    response = client.post('/process', json=test_data)
    
    # Assertions
    assert response.status_code == 200
    assert 'status' in response.json()
    assert response.json()['status'] == 'success'
    assert 'topics_discovered' in response.json()
    assert 'topics' in response.json()

def test_invalid_request():
    # Test data with missing required fields
    invalid_data = {
        'content': {}  # Missing required fields
    }
    
    # Make request to the endpoint
    response = client.post('/process', json=invalid_data)
    
    # Assertions
    assert response.status_code == 422  # Validation error 