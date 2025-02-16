# Topic Discovery Service

## Overview
The Topic Discovery Service is a microservice that automatically identifies trending and emerging topics by analyzing various data sources such as search queries and social media trends. It serves as the starting point for the automated content generation pipeline.

## Features
- Automated topic discovery from multiple data sources
- NLP-based text analysis and processing
- Topic scoring and prioritization
- Google Cloud Pub/Sub integration
- Configurable thresholds and parameters
- REST API endpoints

## Prerequisites
- Python 3.9+
- Docker
- Google Cloud Platform account
- Kubernetes cluster (GKE)

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
- Update `config/topic-discovery-config.json` with your settings
- Set up environment variables (see Configuration section)

4. Run tests:
```bash
python -m pytest tests/
```

5. Start the service locally:
```bash
uvicorn main:app --reload
```

## Docker Build
```bash
docker build -t gcr.io/${PROJECT_ID}/topic-discovery-service:latest .
docker push gcr.io/${PROJECT_ID}/topic-discovery-service:latest
```

## Kubernetes Deployment
1. Update ConfigMap:
```bash
kubectl apply -f kubernetes/topic-discovery-configmap.yaml
```

2. Deploy the service:
```bash
kubectl apply -f kubernetes/topic-discovery-deployment.yaml
```

## Configuration
The service can be configured through:
1. `config/topic-discovery-config.json`:
   - Pub/Sub settings
   - Analysis thresholds
   - NLP parameters

2. Environment variables:
   - `GOOGLE_CLOUD_PROJECT`: GCP project ID
   - `PUBSUB_INPUT_TOPIC`: Input topic name
   - `PUBSUB_OUTPUT_TOPIC`: Output topic name

## API Endpoints
### POST /process
Process raw data to discover topics.

Request body:
```json
{
    "source": "string",
    "content": {
        "social_media": [
            {"text": "string"}
        ],
        "search_queries": ["string"]
    },
    "timestamp": "string (ISO format)"
}
```

Response:
```json
{
    "status": "success",
    "topics_discovered": 0,
    "topics": [
        {
            "term": "string",
            "score": 0.0,
            "timestamp": "string",
            "metadata": {
                "source": "string",
                "region": "string",
                "category": "string"
            }
        }
    ]
}
```

## Testing
- Unit tests: `pytest tests/test_main.py`
- Integration tests: `pytest tests/test_integration.py`
- All tests: `pytest tests/`

## Monitoring
- Health checks via Kubernetes probes
- Logging through Google Cloud Logging
- Metrics available through Kubernetes monitoring

## Error Handling
- Invalid data handling
- Pub/Sub connection issues
- Processing errors
- API validation errors

## Contributing
1. Create a new branch
2. Make your changes
3. Add/update tests
4. Run all tests
5. Submit a pull request

## License
[Your License] 