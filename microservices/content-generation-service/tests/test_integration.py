import pytest
import json
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock

from src.main import ContentGenerationService, ContentRequest

@pytest.fixture(scope="session")
def mock_publisher():
    with patch('google.cloud.pubsub_v1.PublisherClient') as mock:
        publisher = mock.return_value
        publisher.publish = MagicMock()
        yield publisher

@pytest.fixture(scope="session")
def mock_subscriber():
    with patch('google.cloud.pubsub_v1.SubscriberClient') as mock:
        subscriber = mock.return_value
        subscriber.subscribe = MagicMock()
        yield subscriber

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
        model.from_pretrained = MagicMock(return_value=model)
        model.predict_async = AsyncMock()
        model.predict_async.return_value = "This is a test response from Vertex AI."
        yield model

@pytest.mark.asyncio
async def test_pubsub_integration(mock_publisher, mock_subscriber, mock_gemini, mock_vertex):
    """Test integration with Google Cloud Pub/Sub."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()
        
        # Test data
        test_content = {
            'content': 'Test content about AI',
            'metadata': {
                'topic': {
                    'term': 'artificial intelligence',
                    'score': 0.85,
                    'metadata': {
                        'source': 'test',
                        'region': 'global',
                        'category': 'entity'
                    }
                },
                'format': 'article',
                'quality_score': 85.5,
                'generated_at': datetime.utcnow().isoformat(),
                'word_count': 4,
                'slug': 'artificial-intelligence'
            }
        }
        
        # Test publishing content
        await service.publish_content(test_content)
        
        # Verify publisher was called correctly
        mock_publisher.publish.assert_called_once()
        call_args = mock_publisher.publish.call_args
        assert call_args is not None
        
        # Verify published data
        topic_path, data = call_args[0]
        published_data = json.loads(data.decode('utf-8'))
        assert published_data['content'] == 'Test content about AI'
        assert published_data['metadata']['topic']['term'] == 'artificial intelligence'

@pytest.mark.asyncio
async def test_end_to_end_processing(mock_gemini, mock_vertex):
    """Test end-to-end content generation flow."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()
        
        # Test request
        request = ContentRequest(
            topic={
                'term': 'quantum computing',
                'score': 0.9,
                'metadata': {
                    'source': 'research',
                    'region': 'global',
                    'category': 'technology'
                }
            },
            format='article',
            target_audience='scientists',
            style='technical',
            keywords=['quantum', 'computing', 'qubits']
        )
        
        # Generate content
        content = await service.generate_content(request)
        
        # Verify content structure and quality
        assert content['content']
        assert content['metadata']['topic']['term'] == 'quantum computing'
        assert content['metadata']['format'] == 'article'
        assert content['metadata']['quality_score'] >= service.config['quality']['min_readability_score']
        assert 'word_count' in content['metadata']
        assert content['metadata']['slug'] == 'quantum-computing'
        
        # Verify Gemini was called
        mock_gemini.generate_content_async.assert_called()

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
        mock_vertex.predict_async.return_value = vertex_response

        # Test Gemini generation
        gemini_response = await service._generate_with_gemini("Test prompt")
        assert gemini_response.text == "This is a test response from Gemini."

        # Test Vertex AI generation
        vertex_response = await service._generate_with_vertex("Test prompt")
        assert vertex_response.text == "This is a test response from Vertex AI."

@pytest.mark.asyncio
async def test_template_integration(mock_gemini, mock_vertex):
    """Test integration with content templates."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()

        # Test different content formats
        formats = ['article', 'blog_post', 'social_media']

        # Set up mock responses for each section
        mock_gemini.generate_content_async.side_effect = [
            MagicMock(text="This is an introduction about the test topic."),
            MagicMock(text="Point 1\nPoint 2\nPoint 3"),
            MagicMock(text="This is the analysis section."),
            MagicMock(text="This is the conclusion."),
            # Blog post sections
            MagicMock(text="This is a hook for the blog post."),
            MagicMock(text="This is the body of the blog post."),
            MagicMock(text="This is the key takeaway."),
            # Social media sections
            MagicMock(text="This is a social media post about #test #topic")
        ]

        for format_type in formats:
            request = ContentRequest(
                topic={
                    'term': 'test topic',
                    'score': 0.8,
                    'metadata': {
                        'source': 'test',
                        'region': 'global',
                        'category': 'test'
                    }
                },
                format=format_type
            )

            content = await service.generate_content(request)
            assert content is not None
            assert 'content' in content
            assert len(content['content']) > 0

@pytest.mark.asyncio
async def test_quality_integration(mock_gemini, mock_vertex):
    """Test integration of quality checks with AI-generated content."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()

        # Generate content with different quality levels
        mock_gemini.generate_content_async.side_effect = [
            MagicMock(text="Short text."),  # Low quality
            MagicMock(text="This is a well-written paragraph about an interesting topic. "
                         "It contains varied sentence structure and good vocabulary. "
                         "The ideas are clearly expressed and well-organized.")  # Good quality
        ]

        # Test low quality content
        low_quality_request = ContentRequest(
            topic={
                'term': 'test',
                'score': 0.8,
                'metadata': {
                    'source': 'test',
                    'region': 'global',
                    'category': 'test'
                }
            },
            format='article'
        )
        low_quality_content = await service.generate_content(low_quality_request)
        assert low_quality_content is not None
        assert 'content' in low_quality_content
        assert len(low_quality_content['content']) > 0

        # Test good quality content
        good_quality_request = ContentRequest(
            topic={
                'term': 'test',
                'score': 0.9,
                'metadata': {
                    'source': 'test',
                    'region': 'global',
                    'category': 'test'
                }
            },
            format='article'
        )
        good_quality_content = await service.generate_content(good_quality_request)
        assert good_quality_content is not None
        assert 'content' in good_quality_content
        assert len(good_quality_content['content']) > 0

@pytest.mark.asyncio
async def test_error_handling(mock_gemini, mock_vertex):
    """Test error handling in integration scenarios."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()

        # Test with invalid format
        with pytest.raises(ValueError):
            await service.generate_content(
                ContentRequest(
                    topic={
                        'term': 'test',
                        'score': 0.8,
                        'metadata': {
                            'source': 'test',
                            'region': 'global',
                            'category': 'test'
                        }
                    },
                    format='invalid_format'
                )
            )

        # Test with empty topic
        with pytest.raises(ValueError):
            await service.generate_content(
                ContentRequest(
                    topic={
                        'term': '',
                        'score': 0.8,
                        'metadata': {
                            'source': 'test',
                            'region': 'global',
                            'category': 'test'
                        }
                    },
                    format='article'
                )
            )

@pytest.mark.asyncio
async def test_seo_integration(mock_gemini):
    """Test integration of SEO optimization with AI-generated content."""
    with patch('google.cloud.aiplatform.init'), \
         patch('google.generativeai.configure'):
        service = ContentGenerationService()
        
        # Test content and keywords
        mock_gemini.generate_content_async.side_effect = [
            MagicMock(text="The latest developments in technology are transforming our world."),
            MagicMock(text="Research and development\nInnovation trends\nFuture possibilities"),
            MagicMock(text="Technology continues to evolve. New developments shape our future. Artificial intelligence plays a role."),
            MagicMock(text="The future holds great promise for technological advancement. AI will be important.")
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