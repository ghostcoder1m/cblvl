import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from src.main import app, ContentGenerationService, ContentRequest

@pytest.fixture(scope="session")
def client():
    """Create a test client."""
    from fastapi.testclient import TestClient
    return TestClient(app)

@pytest.fixture(scope="session")
def mock_gemini():
    with patch('google.generativeai.GenerativeModel') as mock:
        model = mock.return_value
        model.generate_content_async = AsyncMock()
        response = MagicMock()
        response.text = "This is a test response from Gemini."
        model.generate_content_async.return_value = response
        yield model

@pytest.fixture(scope="session")
def mock_vertex():
    with patch('google.cloud.aiplatform.TextGenerationModel', create=True) as mock:
        model = mock.return_value
        model.predict_async = AsyncMock()
        response = MagicMock()
        response.text = "This is a test response from Vertex AI."
        model.predict_async.return_value = response
        yield model

@pytest.fixture(scope="session")
def content_generation_service(mock_gemini, mock_vertex):
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()
        return service

@pytest.fixture(scope="session")
def sample_topic():
    return {
        'term': 'artificial intelligence',
        'score': 0.85,
        'metadata': {
            'source': 'test',
            'region': 'global',
            'category': 'entity'
        }
    }

@pytest.fixture(scope="session")
def sample_request(sample_topic):
    return ContentRequest(
        topic=sample_topic,
        format='article',
        target_audience='tech professionals',
        style='informative',
        keywords=['AI', 'machine learning', 'technology']
    )

def test_content_request_validation():
    """Test content request validation."""
    # Valid request
    request = ContentRequest(
        topic={
            'term': 'test topic',
            'score': 0.8,
            'metadata': {'category': 'test'}
        },
        format='article'
    )
    assert request.format == 'article'
    
    # Invalid format
    with pytest.raises(ValueError, match="Invalid content format"):
        request = ContentRequest(
            topic={'term': 'test'},
            format='invalid_format'
        )
        # Force validation by accessing a field
        _ = request.format

@pytest.mark.asyncio
async def test_generate_content(content_generation_service, sample_request, mock_gemini):
    """Test content generation with Gemini."""
    # Generate content
    content = await content_generation_service.generate_content(sample_request)
    
    # Verify response structure
    assert 'content' in content
    assert 'metadata' in content
    assert content['metadata']['topic'] == sample_request.topic
    assert content['metadata']['format'] == sample_request.format
    assert 'quality_score' in content['metadata']
    assert 'generated_at' in content['metadata']
    assert 'word_count' in content['metadata']
    assert 'slug' in content['metadata']
    
    # Verify Gemini was called
    mock_gemini.generate_content_async.assert_called()

@pytest.mark.asyncio
async def test_generate_content_fallback(content_generation_service, sample_request, mock_gemini, mock_vertex):
    """Test content generation fallback to Vertex AI."""
    # Make Gemini fail
    mock_gemini.generate_content_async.side_effect = Exception("Gemini error")
    
    # Set up Vertex AI mock response
    mock_vertex.from_pretrained.return_value = mock_vertex
    mock_vertex.predict_async.return_value = MagicMock(text="This is a test response from Vertex AI.")
    
    # Generate content
    content = await content_generation_service.generate_content(sample_request)
    
    # Verify response structure
    assert 'content' in content
    assert 'metadata' in content
    
    # Verify fallback to Vertex AI
    mock_vertex.predict_async.assert_called()

@pytest.mark.asyncio
async def test_generate_sections(content_generation_service, sample_request, mock_gemini):
    """Test section generation."""
    # Set up mock responses for each section
    mock_gemini.generate_content_async.side_effect = [
        MagicMock(text="This is the introduction section."),
        MagicMock(text="These are the main points."),
        MagicMock(text="This is the analysis section."),
        MagicMock(text="This is the conclusion section.")
    ]

    sections = await content_generation_service._generate_sections(
        topic=sample_request.topic,
        format=sample_request.format,
        target_audience=sample_request.target_audience,
        style=sample_request.style
    )
    
    # Verify sections
    template_config = content_generation_service.config['templates'][sample_request.format]
    for section in template_config['sections']:
        assert section in sections
        assert isinstance(sections[section], str)
        assert len(sections[section]) > 0

def test_create_prompt(content_generation_service, sample_request):
    """Test prompt creation."""
    prompt = content_generation_service._create_prompt(
        topic=sample_request.topic,
        section='introduction',
        target_audience=sample_request.target_audience,
        style=sample_request.style
    )
    
    # Verify prompt content
    assert sample_request.topic['term'] in prompt
    assert 'introduction' in prompt
    assert sample_request.target_audience in prompt
    assert sample_request.style in prompt
    assert sample_request.topic['metadata']['category'] in prompt

@pytest.mark.asyncio
async def test_optimize_content(content_generation_service, sample_request):
    """Test content optimization."""
    test_content = "This is a test content about artificial intelligence."
    keywords = ['artificial intelligence', 'AI']
    
    optimized_content = await content_generation_service._optimize_content(
        content=test_content,
        keywords=keywords
    )
    
    # Verify optimization
    assert isinstance(optimized_content, str)
    assert len(optimized_content) > 0
    assert '<!-- meta-description' in optimized_content

def test_clean_content(content_generation_service):
    """Test content cleaning."""
    test_content = '"Smart" quotes and \'apostrophes\' with  extra  spaces'
    cleaned_content = content_generation_service._clean_content(test_content)
    
    # Verify cleaning
    assert ' '.join(cleaned_content.split()) == cleaned_content  # Check extra spaces are removed
    assert '"' not in cleaned_content  # Check smart quotes are removed
    assert '"' not in cleaned_content
    assert "'" not in cleaned_content  # Check smart apostrophes are removed
    assert "'" not in cleaned_content

@pytest.mark.asyncio
async def test_api_endpoint(client, sample_request, mock_gemini):
    """Test the API endpoint."""
    response = client.post('/generate', json=sample_request.dict())
    
    # Verify response
    assert response.status_code == 200
    assert response.json()['status'] == 'success'
    assert 'content' in response.json()

@pytest.mark.asyncio
async def test_error_handling(client, sample_request, mock_gemini, mock_vertex):
    """Test error handling."""
    # Make both Gemini and Vertex AI fail
    mock_gemini.generate_content_async.side_effect = Exception("Gemini error")
    mock_vertex.predict_async.side_effect = Exception("Vertex AI error")
    
    response = client.post('/generate', json=sample_request.dict())
    assert response.status_code == 500

@pytest.mark.asyncio
async def test_rate_limiting(content_generation_service, sample_request, mock_gemini):
    """Test handling of rate limits."""
    # Simulate rate limit error
    mock_gemini.generate_content_async.side_effect = Exception("Rate limit exceeded")
    
    # Should fall back to Vertex AI
    content = await content_generation_service.generate_content(sample_request)
    assert 'content' in content
    assert 'metadata' in content 