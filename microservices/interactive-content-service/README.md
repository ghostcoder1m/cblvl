# Interactive Content Service

A microservice for generating and managing interactive content elements within the content platform. This service enables real-time user engagement through polls, quizzes, comments, reactions, and embedded media.

## Features

- Real-time interactive content generation and management
- Support for multiple interactive element types:
  - Polls with configurable options and expiration
  - Quizzes with scoring and feedback
  - Threaded comments with moderation
  - Reactions with customizable types
  - Embedded media support
- WebSocket-based real-time updates
- Content moderation using Google Cloud Natural Language API
- Analytics tracking and reporting
- Redis-based caching for performance
- Structured logging with Google Cloud integration
- Kubernetes-ready deployment configuration
- Horizontal scaling with custom metrics

## Prerequisites

- Python 3.9+
- Redis
- Google Cloud Platform account with the following APIs enabled:
  - Cloud Storage
  - Cloud Pub/Sub
  - Cloud Natural Language
  - BigQuery
- Docker
- Kubernetes cluster (for production deployment)

## Configuration

The service configuration is managed through environment variables and a ConfigMap in Kubernetes. Key configuration files:

- `config/interactive-content-config.json`: Main service configuration
- `k8s/configmap.yaml`: Kubernetes ConfigMap for environment-specific settings
- `k8s/deployment.yaml`: Kubernetes deployment configuration

Required environment variables:
```
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
ENVIRONMENT=development|production
REDIS_URL=redis://localhost:6379/0
```

## Local Development

1. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
.\venv\Scripts\activate  # Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
export ENVIRONMENT=development
export REDIS_URL=redis://localhost:6379/0
```

4. Run the service:
```bash
uvicorn src.main:app --reload --port 8080
```

## API Endpoints

### Interactive Content Generation

```http
POST /generate
Content-Type: application/json

{
  "content_id": "unique-content-id",
  "content_type": "article|tutorial|discussion",
  "base_content": {
    "title": "Content Title",
    "body": "Content Body"
  },
  "interactive_elements": [
    {
      "type": "polls",
      "question": "Poll Question",
      "options": ["Option 1", "Option 2"]
    }
  ]
}
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/content-id');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

### Health Check

```http
GET /health
```

## Testing

Run the test suite:
```bash
pytest
```

Run with coverage:
```bash
pytest --cov=src tests/
```

## Deployment

### Docker Build

```bash
docker build -t gcr.io/${PROJECT_ID}/interactive-content-service:latest .
docker push gcr.io/${PROJECT_ID}/interactive-content-service:latest
```

### Kubernetes Deployment

1. Create the ConfigMap:
```bash
kubectl apply -f k8s/configmap.yaml
```

2. Create the secret for Google Cloud credentials:
```bash
kubectl create secret generic interactive-content-key \
  --from-file=service-account.json=/path/to/service-account.json
```

3. Deploy the service:
```bash
kubectl apply -f k8s/deployment.yaml
```

## Monitoring

The service exposes metrics for Prometheus at `/metrics` and integrates with Google Cloud Monitoring. Key metrics include:

- Request latency
- Active WebSocket connections
- Interactive element engagement rates
- Moderation statistics
- Cache hit rates

## Error Handling

The service implements comprehensive error handling:

- Input validation using Pydantic models
- Automatic retry for transient failures
- Circuit breakers for external dependencies
- Fallback strategies for degraded functionality
- Structured error responses with error codes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 