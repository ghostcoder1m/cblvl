import os
import pytest
import nltk
from unittest.mock import patch

def pytest_sessionstart(session):
    """Download NLTK data once at the start of the test session."""
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)

@pytest.fixture(autouse=True)
def mock_env_vars():
    """Mock environment variables for testing."""
    with patch.dict(os.environ, {
        'GOOGLE_CLOUD_PROJECT': 'test-project',
        'GOOGLE_CLOUD_REGION': 'us-central1',
        'GOOGLE_AI_API_KEY': 'test-api-key'
    }):
        yield

@pytest.fixture(autouse=True)
def mock_google_auth():
    """Mock Google Auth credentials."""
    with patch('google.auth.default') as mock:
        mock.return_value = ('credentials', 'test-project')
        yield mock 