import pytest
import json
from datetime import datetime
from unittest.mock import MagicMock, patch
from google.cloud import pubsub_v1
from main import TopicDiscoveryService, RawData

@pytest.fixture
def mock_publisher():
    with patch('google.cloud.pubsub_v1.PublisherClient') as mock:
        publisher = mock.return_value
        publisher.publish = MagicMock()
        yield publisher

@pytest.fixture
def mock_subscriber():
    with patch('google.cloud.pubsub_v1.SubscriberClient') as mock:
        subscriber = mock.return_value
        subscriber.subscribe = MagicMock()
        yield subscriber

@pytest.mark.asyncio
async def test_pubsub_integration(mock_publisher, mock_subscriber):
    """Test integration with Google Cloud Pub/Sub."""
    service = TopicDiscoveryService()
    
    # Test data
    test_topics = [
        {
            'term': 'artificial intelligence',
            'score': 0.85,
            'timestamp': datetime.utcnow().isoformat(),
            'metadata': {
                'source': 'test',
                'region': 'global',
                'category': 'entity'
            }
        }
    ]
    
    # Test publishing topics
    await service.publish_topics(test_topics)
    
    # Verify publisher was called correctly
    mock_publisher.publish.assert_called_once()
    call_args = mock_publisher.publish.call_args
    assert call_args is not None
    
    # Verify published data
    topic_path, data = call_args[0]
    published_data = json.loads(data.decode('utf-8'))
    assert published_data['term'] == 'artificial intelligence'
    assert published_data['score'] == 0.85
    assert published_data['metadata']['category'] == 'entity'

@pytest.mark.asyncio
async def test_end_to_end_processing():
    """Test end-to-end data processing flow."""
    service = TopicDiscoveryService()
    
    # Test input data
    input_data = {
        'social_media': [
            {'text': 'Breaking: New AI breakthrough in quantum computing!'},
            {'text': 'Scientists achieve quantum supremacy using AI'},
            {'text': 'Quantum computing revolutionizes AI research'}
        ],
        'search_queries': [
            'quantum computing AI developments',
            'quantum supremacy meaning',
            'AI quantum computing breakthrough'
        ]
    }
    
    # Process the data
    topics = await service.process_raw_data(input_data)
    
    # Verify results
    assert len(topics) > 0
    
    # Check if common terms were identified
    terms = [topic['term'].lower() for topic in topics]
    assert any('quantum' in term for term in terms)
    assert any('ai' in term or 'artificial' in term for term in terms)
    
    # Verify topic structure
    for topic in topics:
        assert 'term' in topic
        assert 'score' in topic
        assert 'timestamp' in topic
        assert 'metadata' in topic
        assert topic['score'] >= 0.6  # Minimum trend score from config
        assert topic['metadata']['category'] in ['entity', 'action', 'attribute', 'other']

@pytest.mark.asyncio
async def test_error_handling():
    """Test error handling in integration scenarios."""
    service = TopicDiscoveryService()
    
    # Test with invalid data
    invalid_data = {
        'social_media': None,
        'search_queries': None
    }
    
    # Should handle invalid data gracefully
    topics = await service.process_raw_data(invalid_data)
    assert topics == []  # Should return empty list for invalid data
    
    # Test with empty data
    empty_data = {
        'social_media': [],
        'search_queries': []
    }
    
    # Should handle empty data gracefully
    topics = await service.process_raw_data(empty_data)
    assert topics == []  # Should return empty list for empty data

@pytest.mark.asyncio
async def test_config_integration():
    """Test integration with configuration settings."""
    service = TopicDiscoveryService()
    
    # Verify config loading
    assert service.config is not None
    assert 'pubsub' in service.config
    assert 'analysis' in service.config
    assert 'nlp' in service.config
    
    # Test with data that should be filtered by config thresholds
    test_data = {
        'social_media': [
            {'text': 'test ' * 100}  # Should be filtered by max token length
        ],
        'search_queries': ['a']  # Should be filtered by min token length
    }
    
    topics = await service.process_raw_data(test_data)
    
    # Verify filtering based on config
    for topic in topics:
        assert len(topic['term']) >= service.config['nlp']['min_token_length']
        assert len(topic['term']) <= service.config['nlp']['max_token_length']
        assert topic['score'] >= service.config['analysis']['min_trend_score'] 