# Content Generation Service

## Overview
The Content Generation Service is a microservice that automatically generates high-quality content based on trending topics. It receives topics from the Topic Discovery Service and uses advanced NLP techniques to create engaging, SEO-optimized content in various formats.

## Features
- Automated content generation using GPT-2
- Multiple content formats (articles, blog posts, social media)
- SEO optimization
- Content quality checks
- Template-based generation
- Google Cloud Pub/Sub integration
- Configurable parameters and thresholds

## Prerequisites
- Python 3.9+
- Docker
- Google Cloud Platform account
- Kubernetes cluster (GKE)
- NVIDIA GPU (optional, for faster generation)

## Local Setup
1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure the service:
- Update `config/content-generation-config.json` with your settings
- Set up environment variables (see Configuration section)

4. Run tests:
```bash
python -m pytest tests/
```

5. Start the service locally:
```bash
uvicorn src.main:app --reload
```

## Docker Build
```bash
docker build -t gcr.io/${PROJECT_ID}/content-generation-service:latest .
docker push gcr.io/${PROJECT_ID}/content-generation-service:latest
```

## Kubernetes Deployment
1. Update ConfigMap:
```bash
kubectl apply -f kubernetes/content-generation-configmap.yaml
```

2. Deploy the service:
```bash
kubectl apply -f kubernetes/content-generation-deployment.yaml
```

## Configuration
The service can be configured through:
1. `config/content-generation-config.json`:
   - Model settings
   - Content parameters
   - SEO settings
   - Quality thresholds
   - Template configurations

2. Environment variables:
   - `GOOGLE_CLOUD_PROJECT`: GCP project ID
   - `PUBSUB_INPUT_TOPIC`: Input topic name
   - `PUBSUB_OUTPUT_TOPIC`: Output topic name
   - `MODEL_NAME`: Hugging Face model name
   - `MODEL_TEMPERATURE`: Generation temperature
   - `MODEL_TOP_P`: Top-p sampling parameter

## API Endpoints
### POST /generate
Generate content for a given topic.

Request body:
```json
{
    "topic": {
        "term": "string",
        "score": 0.0,
        "metadata": {
            "source": "string",
            "region": "string",
            "category": "string"
        }
    },
    "format": "string",
    "target_audience": "string",
    "style": "string",
    "keywords": ["string"]
}
```

Response:
```json
{
    "status": "success",
    "content": {
        "content": "string",
        "metadata": {
            "topic": {},
            "format": "string",
            "quality_score": 0.0,
            "generated_at": "string",
            "word_count": 0,
            "slug": "string"
        }
    }
}
```

## Content Templates
Templates are stored in the `templates` directory and use Jinja2 syntax:
- `article.j2`: Long-form article template
- `blog_post.j2`: Blog post template
- `social_media.j2`: Social media post template

## Quality Checks
The service performs several quality checks:
- Readability score (Flesch Reading Ease)
- Sentence structure variety
- Content diversity
- Keyword density
- Plagiarism detection

## SEO Optimization
SEO features include:
- Keyword optimization
- Meta description generation
- Heading structure
- URL optimization
- Content length control

## Monitoring
- Health checks via Kubernetes probes
- Logging through Google Cloud Logging
- Metrics available through Kubernetes monitoring

## Error Handling
- Invalid request handling
- Model generation errors
- Quality check failures
- Pub/Sub connection issues
- Resource limitations

## Contributing
1. Create a new branch
2. Make your changes
3. Add/update tests
4. Run all tests
5. Submit a pull request

## License
[Your License] 