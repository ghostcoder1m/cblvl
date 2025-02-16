import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import json
import os
from datetime import datetime, timedelta
from src.main import app
from src.models import (
    InteractiveElement,
    PollElement,
    QuizElement,
    CommentElement
)

# Create test client
client = TestClient(app)

@pytest.fixture
def mock_config():
    """Fixture for mock configuration."""
    return {
        "pubsub": {
            "input_topic": "test-input-topic",
            "output_topic": "test-output-topic",
            "subscription": "test-subscription"
        },
        "storage": {
            "bucket": "test-bucket",
            "interactive_prefix": "test-interactive/",
            "templates_prefix": "test-templates/",
            "max_file_size_mb": 10,
            "allowed_formats": ["html", "json", "md"]
        },
        "interactive_elements": {
            "polls": {
                "enabled": True,
                "max_options": 10,
                "min_options": 2,
                "expiration_hours": 72
            },
            "quizzes": {
                "enabled": True,
                "max_questions": 20,
                "min_questions": 1,
                "scoring_enabled": True
            },
            "comments": {
                "enabled": True,
                "moderation": True,
                "max_length": 1000,
                "threading_depth": 3
            }
        },
        "moderation": {
            "enabled": True,
            "auto_moderation": True,
            "toxicity_threshold": 0.8,
            "spam_threshold": 0.9,
            "cache_duration": 3600
        },
        "analytics": {
            "enabled": True,
            "tracking_events": [
                "view",
                "engage",
                "complete",
                "share",
                "react"
            ],
            "retention_days": 90
        }
    }

@pytest.fixture
def mock_service(mock_config):
    """Fixture for mocked service with dependencies."""
    with patch('src.main.InteractiveContentService._load_config') as mock_load_config:
        mock_load_config.return_value = mock_config
        with patch('src.main.InteractiveContentService._initialize_clients'):
            from src.main import InteractiveContentService
            service = InteractiveContentService()
            yield service

@pytest.mark.asyncio
async def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

@pytest.mark.asyncio
async def test_generate_interactive_content(mock_service):
    """Test interactive content generation."""
    request_data = {
        "content_id": "test-content-123",
        "content_type": "article",
        "base_content": {
            "title": "Test Article",
            "body": "This is a test article body."
        },
        "interactive_elements": [
            {
                "type": "polls",
                "id": "poll-1",
                "position": {"x": 0, "y": 100},
                "question": "Test Question?",
                "options": ["Option 1", "Option 2", "Option 3"]
            }
        ],
        "metadata": {
            "author": "test_user",
            "created_at": datetime.utcnow().isoformat()
        }
    }

    with patch('src.main.service.generate_interactive_content') as mock_generate:
        mock_generate.return_value = {
            "content_id": request_data["content_id"],
            "url": f"https://storage.googleapis.com/test-bucket/test-interactive/{request_data['content_id']}.json",
            "type": request_data["content_type"],
            "elements_count": 1,
            "metadata": request_data["metadata"]
        }

        response = client.post("/generate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert data["content_id"] == request_data["content_id"]
        assert "url" in data
        assert data["type"] == request_data["content_type"]
        assert data["elements_count"] == 1

@pytest.mark.asyncio
async def test_invalid_content_type(mock_service):
    """Test handling of invalid content type."""
    request_data = {
        "content_id": "test-content-123",
        "content_type": "invalid_type",
        "base_content": {
            "title": "Test Content",
            "body": "Test body"
        },
        "interactive_elements": []
    }

    response = client.post("/generate", json=request_data)
    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "invalid_type" in data["detail"]

@pytest.mark.asyncio
async def test_poll_validation(mock_service):
    """Test poll element validation."""
    request_data = {
        "content_id": "test-content-123",
        "content_type": "article",
        "base_content": {
            "title": "Test Article",
            "body": "Test body"
        },
        "interactive_elements": [
            {
                "type": "polls",
                "id": "poll-1",
                "position": {"x": 0, "y": 100},
                "question": "Test Question?",
                "options": ["Single Option"]  # Less than min_options
            }
        ]
    }

    response = client.post("/generate", json=request_data)
    assert response.status_code == 500
    data = response.json()
    assert "detail" in data
    assert "options" in data["detail"]

@pytest.mark.asyncio
async def test_moderation(mock_service):
    """Test content moderation."""
    request_data = {
        "content_id": "test-content-123",
        "content_type": "article",
        "base_content": {
            "title": "Test Article",
            "body": "Test body"
        },
        "interactive_elements": [
            {
                "type": "comments",
                "id": "comment-1",
                "position": {"x": 0, "y": 100},
                "thread_id": "thread-1",
                "initial_comments": [
                    {
                        "text": "This is a test comment",
                        "author": "test_user"
                    }
                ]
            }
        ]
    }

    with patch('src.moderation.ContentModerator.moderate_content') as mock_moderate:
        mock_moderate.return_value = {
            "is_safe": True,
            "flags": [],
            "scores": {
                "toxicity": 0.1,
                "spam": 0.1
            }
        }

        response = client.post("/generate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert data["content_id"] == request_data["content_id"]

@pytest.mark.asyncio
async def test_analytics_tracking(mock_service):
    """Test analytics event tracking."""
    with patch('src.analytics.AnalyticsTracker.track_event') as mock_track:
        request_data = {
            "content_id": "test-content-123",
            "content_type": "article",
            "base_content": {
                "title": "Test Article",
                "body": "Test body"
            },
            "interactive_elements": [
                {
                    "type": "reactions",
                    "id": "reaction-1",
                    "position": {"x": 0, "y": 100},
                    "enabled_reactions": ["like", "love"]
                }
            ]
        }

        response = client.post("/generate", json=request_data)
        assert response.status_code == 200
        mock_track.assert_called_once()
        call_args = mock_track.call_args[0]
        assert call_args[0] == "content_generated"
        assert call_args[1]["content_id"] == request_data["content_id"]

@pytest.mark.asyncio
async def test_websocket_connection():
    """Test WebSocket connection and messaging."""
    content_id = "test-content-123"
    with client.websocket_connect(f"/ws/{content_id}") as websocket:
        # Test connection establishment
        data = websocket.receive_json()
        assert data["type"] == "connection_established"
        assert data["content_id"] == content_id

        # Test message broadcast
        test_message = {
            "type": "reaction",
            "content_id": content_id,
            "data": {"reaction": "like"}
        }
        websocket.send_json(test_message)
        
        # Should receive the same message back (broadcast)
        response = websocket.receive_json()
        assert response["type"] == test_message["type"]
        assert response["content_id"] == test_message["content_id"]
        assert "timestamp" in response

@pytest.mark.asyncio
async def test_error_handling():
    """Test error handling and responses."""
    # Test missing required fields
    request_data = {
        "content_type": "article",  # Missing content_id
        "base_content": {
            "title": "Test Article"
        },
        "interactive_elements": []
    }

    response = client.post("/generate", json=request_data)
    assert response.status_code == 422  # Validation error
    data = response.json()
    assert "detail" in data

    # Test invalid JSON
    response = client.post(
        "/generate",
        data="invalid json",
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data 