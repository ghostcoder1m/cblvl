import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timedelta
from google.cloud import bigquery
from src.analytics import AnalyticsTracker

@pytest.fixture
def mock_config():
    """Fixture for mock configuration."""
    return {
        "enabled": True,
        "tracking_events": [
            "view",
            "engage",
            "complete",
            "share",
            "react"
        ],
        "retention_days": 90,
        "batch_size": 100
    }

@pytest.fixture
def tracker(mock_config):
    """Fixture for analytics tracker instance."""
    with patch('google.cloud.bigquery.Client'), \
         patch('google.cloud.pubsub_v1.PublisherClient'):
        return AnalyticsTracker(mock_config)

@pytest.mark.asyncio
async def test_track_event(tracker):
    """Test tracking a single event."""
    event_data = {
        "content_id": "test-content-123",
        "element_id": "element-1",
        "element_type": "poll",
        "user_agent": "test-agent",
        "ip_address": "127.0.0.1"
    }
    
    with patch.object(tracker, '_store_event') as mock_store, \
         patch.object(tracker, '_publish_event') as mock_publish:
        
        await tracker.track_event("view", event_data, "user-123", "session-456")
        
        # Verify event storage
        store_call = mock_store.call_args[0][0]
        assert store_call["event_type"] == "view"
        assert store_call["content_id"] == event_data["content_id"]
        assert store_call["user_id"] == "user-123"
        assert store_call["session_id"] == "session-456"
        assert "timestamp" in store_call
        
        # Verify event publishing
        publish_call = mock_publish.call_args[0][0]
        assert publish_call == store_call

@pytest.mark.asyncio
async def test_track_event_disabled(tracker):
    """Test event tracking when disabled."""
    tracker.config["enabled"] = False
    
    with patch.object(tracker, '_store_event') as mock_store, \
         patch.object(tracker, '_publish_event') as mock_publish:
        
        await tracker.track_event("view", {"content_id": "test-123"})
        
        mock_store.assert_not_called()
        mock_publish.assert_not_called()

@pytest.mark.asyncio
async def test_track_invalid_event(tracker):
    """Test tracking an invalid event type."""
    with patch.object(tracker, '_store_event') as mock_store, \
         patch.object(tracker, '_publish_event') as mock_publish:
        
        await tracker.track_event("invalid_event", {"content_id": "test-123"})
        
        mock_store.assert_not_called()
        mock_publish.assert_not_called()

@pytest.mark.asyncio
async def test_store_event(tracker):
    """Test storing event in BigQuery."""
    event = {
        "event_id": "test-event-123",
        "content_id": "test-content-123",
        "event_type": "view",
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": "user-123",
        "element_id": "element-1",
        "interaction_data": "{}"
    }
    
    with patch.object(tracker.executor, 'submit') as mock_submit:
        await tracker._store_event(event)
        mock_submit.assert_called_once()

@pytest.mark.asyncio
async def test_publish_event(tracker):
    """Test publishing event to Pub/Sub."""
    event = {
        "event_id": "test-event-123",
        "content_id": "test-content-123",
        "event_type": "view",
        "timestamp": datetime.utcnow().isoformat()
    }
    
    mock_future = AsyncMock()
    tracker.publisher.publish.return_value = mock_future
    
    await tracker._publish_event(event)
    
    tracker.publisher.publish.assert_called_once()
    publish_call = tracker.publisher.publish.call_args
    assert 'interactive-analytics-events' in publish_call[0][0]

@pytest.mark.asyncio
async def test_get_content_metrics(tracker):
    """Test retrieving content metrics."""
    content_id = "test-content-123"
    time_range = timedelta(days=7)
    
    mock_results = [
        MagicMock(
            event_type="view",
            count=100,
            unique_users=50,
            unique_sessions=75
        ),
        MagicMock(
            event_type="engage",
            count=50,
            unique_users=30,
            unique_sessions=40
        )
    ]
    
    with patch.object(tracker, '_execute_query', return_value=mock_results):
        metrics = await tracker.get_content_metrics(content_id, time_range)
        
        assert metrics["content_id"] == content_id
        assert metrics["time_range"] == str(time_range)
        assert metrics["total_interactions"] == 150
        assert metrics["unique_users"] == 50
        assert "view" in metrics["events_breakdown"]
        assert "engage" in metrics["events_breakdown"]

@pytest.mark.asyncio
async def test_get_realtime_metrics(tracker):
    """Test retrieving real-time metrics."""
    content_id = "test-content-123"
    window_minutes = 5
    
    mock_results = [
        MagicMock(
            event_type="view",
            minute=datetime.utcnow(),
            count=10
        ),
        MagicMock(
            event_type="engage",
            minute=datetime.utcnow(),
            count=5
        )
    ]
    
    with patch.object(tracker, '_execute_query', return_value=mock_results), \
         patch.object(tracker, '_get_active_users', return_value=15):
        
        metrics = await tracker.get_realtime_metrics(content_id, window_minutes)
        
        assert metrics["content_id"] == content_id
        assert metrics["window_minutes"] == window_minutes
        assert metrics["current_active_users"] == 15
        assert metrics["total_events"] == 15
        assert "view" in metrics["events_timeline"]
        assert "engage" in metrics["events_timeline"]

@pytest.mark.asyncio
async def test_get_active_users(tracker):
    """Test retrieving active user count."""
    content_id = "test-content-123"
    active_window = timedelta(minutes=5)
    
    mock_results = [MagicMock(active_users=25)]
    
    with patch.object(tracker, '_execute_query', return_value=mock_results):
        active_users = await tracker._get_active_users(content_id, active_window)
        assert active_users == 25

@pytest.mark.asyncio
async def test_error_handling(tracker):
    """Test error handling in analytics tracking."""
    event_data = {"content_id": "test-content-123"}
    
    # Test storage error
    with patch.object(tracker, '_store_event', side_effect=Exception("Storage Error")), \
         patch.object(tracker, '_publish_event') as mock_publish:
        
        await tracker.track_event("view", event_data)
        # Should still attempt to publish even if storage fails
        mock_publish.assert_called_once()
    
    # Test publishing error
    with patch.object(tracker, '_store_event') as mock_store, \
         patch.object(tracker, '_publish_event', side_effect=Exception("Publish Error")):
        
        await tracker.track_event("view", event_data)
        # Should still store even if publishing fails
        mock_store.assert_called_once()

@pytest.mark.asyncio
async def test_query_execution(tracker):
    """Test BigQuery query execution."""
    query = "SELECT * FROM test_table"
    job_config = bigquery.QueryJobConfig()
    
    mock_query_job = MagicMock()
    mock_query_job.result.return_value = ["result1", "result2"]
    tracker.bigquery_client.query.return_value = mock_query_job
    
    results = tracker._execute_query(query, job_config)
    
    tracker.bigquery_client.query.assert_called_once_with(
        query,
        job_config=job_config
    )
    assert results == ["result1", "result2"]

@pytest.mark.asyncio
async def test_client_info_extraction(tracker):
    """Test client information extraction from event data."""
    event_data = {
        "user_agent": "test-agent",
        "ip_address": "127.0.0.1",
        "device_type": "desktop",
        "platform": "web",
        "locale": "en-US",
        "referrer": "https://example.com"
    }
    
    client_info = tracker._get_client_info(event_data)
    
    assert client_info["user_agent"] == event_data["user_agent"]
    assert client_info["ip_address"] == event_data["ip_address"]
    assert client_info["device_type"] == event_data["device_type"]
    assert client_info["platform"] == event_data["platform"]
    assert client_info["locale"] == event_data["locale"]
    assert client_info["referrer"] == event_data["referrer"] 