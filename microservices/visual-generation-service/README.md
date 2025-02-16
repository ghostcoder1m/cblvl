# Visual Generation Service

This service is responsible for generating images based on text prompts using multiple AI models. It supports both Stability AI and Replicate's Stable Diffusion models, with automatic fallback mechanisms.

## Features

- Text-to-image generation using multiple AI models
- Automatic model fallback if primary model fails
- Image quality checks and validation
- Cloud Storage integration for image persistence
- Pub/Sub integration for async notifications
- Structured logging with Google Cloud Logging
- Health check endpoint
- Containerized deployment

## Prerequisites

- Python 3.9+
- Docker
- Google Cloud Platform account with the following APIs enabled:
  - Cloud Storage
  - Cloud Pub/Sub
  - Cloud Logging
- Stability AI API key
- Replicate API token

## Configuration

The service uses a JSON configuration file located at `config/visual-generation-config.json`. Key configuration options include:

- Generation settings for each AI model
- Storage bucket and prefix configuration
- Pub/Sub topic names
- Image quality requirements

## Environment Variables

Required environment variables:

```
GOOGLE_CLOUD_PROJECT=your-project-id
STABILITY_API_KEY=your-stability-api-key
REPLICATE_API_TOKEN=your-replicate-token
```

Optional environment variables:

```
PORT=8080  # Default port for the service
```

## API Endpoints

### Generate Images
```http
POST /generate
```

Request body:
```json
{
  "prompt": "a beautiful sunset",
  "style": "realistic",
  "width": 1024,
  "height": 1024,
  "num_images": 1
}
```

Response:
```json
{
  "status": "success",
  "images": [
    {
      "url": "https://storage.googleapis.com/bucket/image.png",
      "metadata": {
        "prompt": "a beautiful sunset",
        "style": "realistic",
        "width": 1024,
        "height": 1024,
        "generated_at": "2024-02-15T20:00:00Z",
        "model": "stability-ai"
      }
    }
  ]
}
```

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-02-15T20:00:00Z"
}
```

## Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export STABILITY_API_KEY=your-stability-api-key
export REPLICATE_API_TOKEN=your-replicate-token
```

3. Run the service:
```bash
uvicorn main:app --reload
```

## Testing

Run tests using pytest:
```bash
pytest tests/
```

## Docker Deployment

Build the container:
```bash
docker build -t visual-generation-service .
```

Run the container:
```bash
docker run -p 8080:8080 \
  -e GOOGLE_CLOUD_PROJECT=your-project-id \
  -e STABILITY_API_KEY=your-stability-api-key \
  -e REPLICATE_API_TOKEN=your-replicate-token \
  visual-generation-service
```

## Monitoring and Logging

The service uses structured logging with Google Cloud Logging integration. All logs include:
- Severity level
- Service name
- Timestamp
- Detailed error information when applicable

## Error Handling

The service includes comprehensive error handling:
- Input validation using Pydantic models
- Graceful fallback between AI models
- Detailed error messages in responses
- Automatic retry mechanisms for transient failures

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request 