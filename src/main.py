import re

def _clean_content(self, content: str) -> str:
    """Clean and format content."""
    # Remove extra spaces
    content = ' '.join(content.split())
    
    # Replace quotes with regular quotes
    quotes_map = {
        '"': '"',  # Left double quote
        '"': '"',  # Right double quote
        ''': "'",  # Left single quote
        ''': "'",  # Right single quote
        '`': "'",  # Backtick
        '´': "'",  # Acute accent
        '"': '"',  # Regular double quote
        "'": "'",  # Regular single quote
    }
    
    # Replace quotes in order
    for smart_quote, regular_quote in quotes_map.items():
        content = content.replace(smart_quote, regular_quote)
    
    # Final pass to ensure all quotes are standardized
    content = content.replace('"', '"').replace("'", "'")
    
    # Replace any remaining smart quotes
    content = re.sub(r'["""]', '"', content)
    content = re.sub(r'[''`´]', "'", content)
    
    return content

async def generate_content(self, request: ContentRequest) -> Dict[str, Any]:
    """Generate content based on the request."""
    try:
        # Generate sections
        sections = await self._generate_sections(request)
        
        # Check if any sections failed to generate
        if not all(sections.values()):
            raise ValueError("Failed to generate one or more content sections")
        
        # Combine sections into final content
        content = '\n\n'.join(sections.values())
        
        # Clean and optimize content
        content = self._clean_content(content)
        content = await self.seo_optimizer.optimize(content, request.keywords or [request.topic['term']])
        
        # Check content quality
        quality_score = await self.quality_checker.check(content)
        if quality_score < self.config['quality']['min_readability_score']:
            logger.warning(f"Content quality score {quality_score} below threshold")
            
        # Prepare metadata
        metadata = {
            'quality_score': quality_score,
            'word_count': len(content.split()),
            'generated_at': datetime.utcnow().isoformat()
        }
        
        # Publish to Pub/Sub if configured
        if self.publisher:
            await self.publish_content({'content': content, 'metadata': metadata})
        else:
            logger.warning("Pub/Sub publisher not initialized, skipping publish")
        
        return {
            'content': content,
            'metadata': metadata
        }
        
    except Exception as e:
        logger.error(f"Error generating content: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Content generation failed: {str(e)}"
        ) from e  # Add from e to preserve the original traceback

async def _generate_sections(self, request: ContentRequest) -> Dict[str, str]:
    """Generate content sections."""
    sections = {}
    section_prompts = self._create_section_prompts(request)
    
    for section_name, prompt in section_prompts.items():
        try:
            response = await self._generate_with_gemini(prompt)
            sections[section_name] = response.text
        except Exception as e:
            logger.warning(f"Gemini generation failed, falling back to Vertex AI: {str(e)}")
            try:
                vertex_response = await self._generate_with_vertex(prompt)
                sections[section_name] = vertex_response.text
            except Exception as fallback_error:
                logger.error(f"Error generating section {section_name}: {str(fallback_error)}")
                raise  # Re-raise the error to trigger error handling
    
    return sections

async def _generate_with_vertex(self, prompt: str) -> Any:
    """Generate content using Vertex AI."""
    response = await self.vertex_model.predict_async(prompt)
    return response

# Initialize FastAPI app
app = FastAPI()

# Initialize service
service = ContentGenerationService()

@app.post('/generate')
async def generate(request: ContentRequest) -> Dict[str, Any]:
    """Generate content based on the request."""
    try:
        return await service.generate_content(request)
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        ) 