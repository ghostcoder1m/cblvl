# Video Generation Service

A FastAPI-based microservice for generating AI-powered videos using Google Cloud services.

## Features

- Script generation using Google's Gemini AI
- Voice-over generation using Google Cloud Text-to-Speech
- Image generation and processing
- Video creation with FFmpeg
- Real-time progress updates via WebSocket
- Google Cloud Storage integration
- Configurable video formats (YouTube Shorts, TikTok, etc.)

## Prerequisites

- Python 3.9+
- FFmpeg installed on your system
- Google Cloud project with required APIs enabled:
  - Gemini AI API
  - Cloud Text-to-Speech API
  - Cloud Storage
  - Cloud Logging

## Setup

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

3. Set up environment variables in `.env`:
```bash
GOOGLE_AI_API_KEY=your_gemini_api_key
GOOGLE_APPLICATION_CREDENTIALS=path_to_service_account.json
STORAGE_BUCKET=your_storage_bucket_name
```

4. Configure the service in `config/video-generation-config.json`:
- Adjust video formats and quality settings
- Configure API parameters
- Set storage preferences
- Customize processing options

## Running the Service

Start the service with uvicorn:
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload
```

## API Endpoints

### POST /generate
Start video generation process:
```json
{
  "taskId": "unique_task_id",
  "trends": ["trend1", "trend2"],
  "format": "youtube_shorts",
  "style": "engaging",
  "targetAudience": "young_adults",
  "duration": "60s",
  "prompt": "Video content description",
  "additionalInstructions": "Optional instructions"
}
```

### WebSocket /ws/{task_id}
Connect to receive real-time progress updates:
```json
{
  "taskId": "task_id",
  "progress": 0.5,
  "status": "generating_voice_over"
}
```

## Error Handling

The service provides detailed error messages and logging:
- Input validation errors
- API errors
- Processing failures
- Resource limitations

## Monitoring

- Real-time progress tracking via WebSocket
- Detailed logging with Google Cloud Logging
- Error reporting and monitoring
- Resource usage tracking

## Development

1. Install development dependencies:
```bash
pip install -r requirements-dev.txt  # If you have separate dev requirements
```

2. Run tests:
```bash
pytest
```

3. Format code:
```bash
black src/
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 