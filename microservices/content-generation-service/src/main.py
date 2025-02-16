import json
import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from unittest.mock import MagicMock

import google.generativeai as genai
from google.cloud import aiplatform
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, validator
from jinja2 import Environment, FileSystemLoader
from bs4 import BeautifulSoup
from slugify import slugify
try:
    from google.cloud import pubsub_v1
    from google.cloud import logging as cloud_logging
except ImportError:
    pubsub_v1 = None
    cloud_logging = None

from .templates import load_templates
from .quality import QualityChecker
from .seo import SEOOptimizer

# Initialize FastAPI app
app = FastAPI(title="Content Generation Service")

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Setup logging
logger = logging.getLogger("content-generation-service")
if cloud_logging:
    try:
        logging_client = cloud_logging.Client()
        logger = logging_client.logger("content-generation-service")
    except Exception as e:
        logger.warning(f"Failed to initialize Cloud Logging: {str(e)}")
        logger.warning("Falling back to standard logging")
        logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))

class ContentRequest(BaseModel):
    """Pydantic model for content generation request."""
    topic: Dict[str, Any]
    format: str
    target_audience: Optional[str] = None
    style: Optional[str] = None
    keywords: Optional[List[str]] = None

    @validator('format')
    def validate_format(cls, v):
        valid_formats = ['article', 'blog_post', 'social_media']
        if v not in valid_formats:
            raise ValueError(f"Invalid content format. Must be one of: {valid_formats}")
        return v

    @validator('topic')
    def validate_topic(cls, v):
        if not v.get('term'):
            raise ValueError("Topic term cannot be empty")
        return v

class ContentGenerationService:
    def __init__(self):
        self.config = self._load_config()
        
        # Initialize Pub/Sub clients
        if pubsub_v1:
            try:
                self.publisher = pubsub_v1.PublisherClient()
                self.subscriber = pubsub_v1.SubscriberClient()
            except Exception as e:
                logger.warning(f"Failed to initialize Pub/Sub clients: {str(e)}")
                self.publisher = None
                self.subscriber = None
        else:
            self.publisher = None
            self.subscriber = None
        
        # Initialize Google AI services
        self._init_ai_services()
        
        # Load templates
        self.templates = load_templates()
        
        # Initialize quality checker and SEO optimizer
        self.quality_checker = QualityChecker(self.config['quality'])
        self.seo_optimizer = SEOOptimizer(self.config['seo'])

    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '../config/content-generation-config.json'
        )
        with open(config_path, 'r') as f:
            return json.load(f)

    def _init_ai_services(self):
        """Initialize Google AI services."""
        try:
            # Initialize Vertex AI
            aiplatform.init(
                project=os.getenv('GOOGLE_CLOUD_PROJECT'),
                location=os.getenv('GOOGLE_CLOUD_REGION', 'us-central1')
            )
            
            # Initialize Gemini API
            genai.configure(api_key=os.getenv('GOOGLE_AI_API_KEY'))
            
            # Get model configuration
            model_config = self.config['model']
            
            # Initialize Gemini model
            self.gemini_model = genai.GenerativeModel(
                model_name=model_config.get('name', 'gemini-pro'),
                generation_config={
                    'temperature': model_config.get('temperature', 0.7),
                    'top_p': model_config.get('top_p', 0.9),
                    'max_output_tokens': model_config.get('max_tokens', 1000)
                }
            )
            
            # Initialize Vertex AI model (for backup/specific use cases)
            self.vertex_model = aiplatform.TextGenerationModel.from_pretrained(
                'text-bison@002'  # or another appropriate model
            )
            
            logger.info("Successfully initialized Google AI services")
            
        except Exception as e:
            logger.error(f"Failed to initialize Google AI services: {str(e)}")
            self.gemini_model = None
            self.vertex_model = None

    async def generate_content(self, request: ContentRequest) -> Dict[str, Any]:
        """Generate content based on the given topic and format."""
        try:
            # Validate format
            if request.format not in self.config['content']['formats']:
                raise ValueError(f"Unsupported format: {request.format}")

            # Get template for the requested format
            template = self.templates.get_template(f"{request.format}.j2")
            
            # Generate content sections
            sections = await self._generate_sections(
                topic=request.topic,
                format=request.format,
                target_audience=request.target_audience,
                style=request.style
            )
            
            # Apply template
            content = template.render(
                topic=request.topic,
                sections=sections,
                metadata={
                    'generated_at': datetime.utcnow().isoformat(),
                    'format': request.format,
                    'target_audience': request.target_audience,
                    'style': request.style
                }
            )
            
            # Optimize content
            content = await self._optimize_content(
                content=content,
                keywords=request.keywords or [request.topic['term']]
            )
            
            # Check quality
            quality_score = await self.quality_checker.check(content)
            if quality_score < self.config['quality']['min_readability_score']:
                logger.warning(f"Content quality score {quality_score} below threshold")
            
            # Prepare response
            response = {
                'content': content,
                'metadata': {
                    'topic': request.topic,
                    'format': request.format,
                    'quality_score': quality_score,
                    'generated_at': datetime.utcnow().isoformat(),
                    'word_count': len(content.split()),
                    'slug': slugify(request.topic['term'])
                }
            }
            
            # Publish generated content
            await self.publish_content(response)
            
            return response
            
        except Exception as e:
            logger.error(f"Error generating content: {str(e)}")
            raise

    async def _generate_sections(
        self,
        topic: Dict[str, Any],
        format: str,
        target_audience: Optional[str] = None,
        style: Optional[str] = None
    ) -> Dict[str, str]:
        """Generate content sections using Google AI services."""
        sections = {}
        template_config = self.config['templates'][format]
        
        for section in template_config['sections']:
            try:
                # Create prompt for the section
                prompt = self._create_prompt(
                    topic=topic,
                    section=section,
                    target_audience=target_audience,
                    style=style
                )
                
                # Try Gemini first
                try:
                    response = await self._generate_with_gemini(prompt)
                    section_content = response.text
                except Exception as e:
                    logger.warning(f"Gemini generation failed, falling back to Vertex AI: {str(e)}")
                    response = await self._generate_with_vertex(prompt)
                    section_content = response.text
                
                # Clean up the generated text
                section_content = self._clean_content(section_content)
                
                sections[section] = section_content
                
            except Exception as e:
                logger.error(f"Error generating section {section}: {str(e)}")
                sections[section] = f"Error generating {section}"
        
        return sections

    async def _generate_with_gemini(self, prompt: str) -> Any:
        """Generate content using Gemini API."""
        response = await self.gemini_model.generate_content_async(prompt)
        return response

    async def _generate_with_vertex(self, prompt: str) -> Any:
        """Generate content using Vertex AI."""
        response = await self.vertex_model.predict_async(prompt)
        if isinstance(response, str):
            # Create a response object that matches the Gemini response structure
            mock_response = MagicMock()
            mock_response.text = response
            return mock_response
        return response

    def _create_prompt(
        self,
        topic: Dict[str, Any],
        section: str,
        target_audience: Optional[str] = None,
        style: Optional[str] = None
    ) -> str:
        """Create a prompt for content generation."""
        prompt = f"Write a {section} about {topic['term']}."
        
        if target_audience:
            prompt += f" Target audience: {target_audience}."
        
        if style:
            prompt += f" Writing style: {style}."
            
        if topic.get('metadata', {}).get('category'):
            prompt += f" Category: {topic['metadata']['category']}."
            
        return prompt

    async def _optimize_content(self, content: str, keywords: List[str]) -> str:
        """Optimize content for SEO and readability."""
        # Clean HTML if present
        if '<' in content and '>' in content:
            soup = BeautifulSoup(content, 'html.parser')
            content = soup.get_text()
        
        # Optimize for SEO
        optimized_content = await self.seo_optimizer.optimize(content, keywords)
        
        return optimized_content

    def _clean_content(self, content: str) -> str:
        """Clean and format the generated content."""
        # Remove extra spaces
        content = ' '.join(content.split())
        
        # Replace smart quotes with regular quotes
        quotes_map = {
            '"': '"',  # Left double quote
            '"': '"',  # Right double quote
            '"': '"',  # Straight double quote
            ''': "'",  # Left single quote
            ''': "'",  # Right single quote
            '′': "'",  # Prime
            '‛': "'",  # Reversed single quote
            '`': "'",  # Backtick
            '´': "'"   # Acute accent
        }
        
        for smart_quote, regular_quote in quotes_map.items():
            content = content.replace(smart_quote, regular_quote)
        
        return content

    async def publish_content(self, content: Dict[str, Any]) -> None:
        """Publish generated content to Pub/Sub."""
        if not self.publisher:
            logger.warning("Pub/Sub publisher not initialized, skipping publish")
            return

        try:
            topic_path = self.config['pubsub']['output_topic']
            data = json.dumps(content).encode('utf-8')
            
            future = self.publisher.publish(topic_path, data)
            future.result()  # Wait for publishing to complete
            
            logger.info(f"Successfully published content for topic: {content['metadata']['topic']['term']}")
        except Exception as e:
            logger.error(f"Error publishing content: {str(e)}")
            raise

# Initialize the service
content_generation_service = ContentGenerationService()

@app.post("/generate")
async def generate_content(request: ContentRequest):
    """API endpoint to generate content."""
    try:
        content = await content_generation_service.generate_content(request)
        return {
            "status": "success",
            "content": content
        }
    except Exception as e:
        logger.error(f"Error in generate_content endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 