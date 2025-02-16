# Audio Generation Service

This service is part of the Content Automation System and is responsible for converting text content into high-quality audio using Google Cloud Text-to-Speech API with a local fallback mechanism.

## Features

- Text-to-Speech conversion using Google Cloud TTS API
- Local fallback using pyttsx3 when Cloud TTS is unavailable
- Support for multiple languages and voices
- Audio quality validation
- Cloud Storage integration for audio file storage
- Pub/Sub integration for event-driven architecture
- Configurable audio parameters (sample rate, speaking rate, pitch)
- Comprehensive error handling and logging
- Health monitoring endpoints

## Prerequisites

- Python 3.9+
- Google Cloud Platform account with the following APIs enabled:
  - Cloud Text-to-Speech API
  - Cloud Storage
  - Cloud Pub/Sub
- Docker (for containerized deployment)
- Kubernetes cluster (for production deployment)

## Local Development Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or
   .\venv\Scripts\activate  # Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/service-account-key.json"
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   ```

4. Run the service:
   ```bash
   uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Configuration

The service can be configured through environment variables or a ConfigMap in Kubernetes:

- `GOOGLE_CLOUD_PROJECT`: Your GCP project ID
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key file
- `PUBSUB_INPUT_TOPIC`: Topic for receiving text content
- `PUBSUB_OUTPUT_TOPIC`: Topic for publishing audio metadata
- `PUBSUB_SUBSCRIPTION`: Subscription for processing messages
- `STORAGE_BUCKET`: GCS bucket for storing audio files
- `STORAGE_PREFIX`: Prefix for audio files in the bucket
- `TTS_LANGUAGE_CODE`: Default language code (e.g., "en-US")
- `TTS_VOICE_NAME`: Default voice name (e.g., "en-US-Neural2-D")
- `TTS_SPEAKING_RATE`: Speech rate (default: 1.0)
- `TTS_PITCH`: Voice pitch (default: 0)
- `TTS_SAMPLE_RATE`: Sample rate in Hz (default: 24000)

## API Endpoints

### POST /generate-audio
Generate audio from text content.

Request body:
```json
{
  "text": "Text to convert to audio",
  "language_code": "en-US",
  "voice_name": "en-US-Neural2-D",
  "output_format": "mp3"
}
```

Response:
```json
{
  "status": "success",
  "audio_url": "https://storage.googleapis.com/bucket/audio/file.mp3",
  "metadata": {
    "text": "Text to convert to audio",
    "language": "en-US",
    "format": "mp3",
    "duration": 3.5,
    "created_at": "2024-02-14T12:00:00Z"
  }
}
```

### GET /health
Health check endpoint.

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-02-14T12:00:00Z"
}
```

## Testing

Run unit tests:
```bash
pytest tests/test_unit.py -v
```

Run integration tests:
```bash
pytest tests/test_integration.py -v
```

## Deployment

### Docker Build
```bash
docker build -t gcr.io/${PROJECT_ID}/audio-generation-service:latest .
docker push gcr.io/${PROJECT_ID}/audio-generation-service:latest
```

### Kubernetes Deployment
```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
```

## Monitoring

The service includes:
- Prometheus metrics endpoint at `/metrics`
- Structured logging to Cloud Logging
- Custom metrics for:
  - Audio generation latency
  - Success/failure rates
  - Fallback usage
  - Audio quality metrics

## Error Handling

The service implements comprehensive error handling:
1. Cloud TTS failures trigger local fallback
2. Storage failures are retried with exponential backoff
3. All errors are logged with appropriate context
4. Failed messages are dead-lettered for manual review

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 