import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from src.main import ContentGenerationService
from src.models import ContentRequest

@pytest.fixture(scope="session")
def mock_vertex():
    """Mock Vertex AI model."""
    mock = MagicMock()
    mock.from_pretrained.return_value = mock
    mock.predict_async = AsyncMock(return_value=MagicMock(text="This is a test response from Vertex AI."))
    return mock

@pytest.mark.asyncio
async def test_ai_service_integration(mock_gemini, mock_vertex):
    """Test integration with Google AI services."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()

        # Set up mock responses
        mock_gemini.generate_content_async.return_value = MagicMock(text="This is a test response from Gemini.")
        mock_vertex.from_pretrained.return_value = mock_vertex
        vertex_response = MagicMock()
        vertex_response.text = "This is a test response from Vertex AI."
        mock_vertex.predict_async = AsyncMock(return_value=vertex_response)

        # Test Gemini generation
        gemini_response = await service._generate_with_gemini("Test prompt")
        assert gemini_response.text == "This is a test response from Gemini."

        # Test Vertex AI generation
        vertex_response = await service._generate_with_vertex("Test prompt")
        assert vertex_response.text == "This is a test response from Vertex AI."

@pytest.mark.asyncio
async def test_seo_integration(mock_gemini):
    """Test integration of SEO optimization with AI-generated content."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()

        # Test content and keywords with lower keyword density
        mock_gemini.generate_content_async.side_effect = [
            MagicMock(text="The latest developments in technology are transforming our world."),
            MagicMock(text="Research and innovation\nTechnology trends\nFuture possibilities"),
            MagicMock(text="Technology continues to evolve. Many developments shape our future. One aspect is artificial intelligence."),
            MagicMock(text="The future holds great promise. Innovation will be important.")
        ]

        request = ContentRequest(
            topic={
                'term': 'artificial intelligence',
                'score': 0.9,
                'metadata': {
                    'source': 'test',
                    'region': 'global',
                    'category': 'technology'
                }
            },
            format='article',
            keywords=['artificial intelligence', 'AI']
        )

        content = await service.generate_content(request)

        # Verify SEO elements
        assert '<!-- meta-description' in content['content']

        # Check keyword density
        density = service.seo_optimizer._calculate_keyword_density(
            content['content'],
            request.keywords or [request.topic['term']]
        )

        # Verify density is within acceptable range
        min_density = service.config['seo']['keyword_density'] * 0.5
        max_density = service.config['seo']['max_keyword_density']
        assert min_density <= density <= max_density, f"Keyword density {density} not in range [{min_density}, {max_density}]" 