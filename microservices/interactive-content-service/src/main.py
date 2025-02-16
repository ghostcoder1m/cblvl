import os
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aioredis
from google.cloud import storage, pubsub_v1
import logging
from logging_config import setup_logging, get_logger
from models import (
    InteractiveElement,
    PollElement,
    QuizElement,
    CommentElement,
    ReactionElement,
    EmbeddedMediaElement
)
from websocket_manager import WebSocketManager
from moderation import ContentModerator
from analytics import AnalyticsTracker

# Initialize logging
setup_logging()
logger = get_logger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Interactive Content Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InteractiveContentRequest(BaseModel):
    """Request model for interactive content generation."""
    content_id: str
    content_type: str = Field(..., description="Type of content (article, tutorial, discussion)")
    base_content: Dict[str, Any]
    interactive_elements: List[InteractiveElement]
    metadata: Optional[Dict[str, Any]] = None

class InteractiveContentService:
    def __init__(self):
        self._load_config()
        self._initialize_clients()
        self.websocket_manager = WebSocketManager()
        self.content_moderator = ContentModerator(self.config["moderation"])
        self.analytics_tracker = AnalyticsTracker(self.config["analytics"])
        logger.info("Interactive Content Service initialized")

    def _load_config(self) -> Dict[str, Any]:
        """Load service configuration."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '../config/interactive-content-config.json'
        )
        with open(config_path) as f:
            self.config = json.load(f)
        return self.config

    async def _initialize_clients(self):
        """Initialize API clients and Redis connection."""
        # Initialize Google Cloud clients
        self.storage_client = storage.Client()
        self.publisher = pubsub_v1.PublisherClient()
        
        # Initialize Redis connection
        if self.config["realtime"]["redis"]["enabled"]:
            self.redis = await aioredis.from_url(
                os.getenv("REDIS_URL", "redis://localhost"),
                encoding="utf-8",
                decode_responses=True
            )

    async def generate_interactive_content(
        self,
        request: InteractiveContentRequest
    ) -> Dict[str, Any]:
        """Generate interactive content based on the request."""
        try:
            # Validate content type and template
            if request.content_type not in self.config["templates"]:
                raise ValueError(f"Unsupported content type: {request.content_type}")

            # Process and validate interactive elements
            processed_elements = await self._process_interactive_elements(
                request.interactive_elements,
                request.content_type
            )

            # Generate interactive content structure
            interactive_content = {
                "id": request.content_id,
                "type": request.content_type,
                "base_content": request.base_content,
                "interactive_elements": processed_elements,
                "metadata": {
                    **(request.metadata or {}),
                    "generated_at": datetime.utcnow().isoformat(),
                    "version": "1.0"
                }
            }

            # Store content
            content_url = await self._store_content(
                request.content_id,
                interactive_content
            )

            # Track analytics event
            await self.analytics_tracker.track_event(
                "content_generated",
                {
                    "content_id": request.content_id,
                    "content_type": request.content_type,
                    "elements_count": len(processed_elements)
                }
            )

            # Publish result
            result = {
                "content_id": request.content_id,
                "url": content_url,
                "type": request.content_type,
                "elements_count": len(processed_elements),
                "metadata": interactive_content["metadata"]
            }
            await self._publish_result(result)

            return result

        except Exception as e:
            logger.error(f"Error generating interactive content: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Interactive content generation failed: {str(e)}"
            )

    async def _process_interactive_elements(
        self,
        elements: List[InteractiveElement],
        content_type: str
    ) -> List[Dict[str, Any]]:
        """Process and validate interactive elements."""
        template_config = self.config["templates"][content_type]
        allowed_elements = template_config["allowed_elements"]
        processed_elements = []

        for element in elements:
            # Validate element type
            if element.type not in allowed_elements:
                logger.warning(f"Skipping unsupported element type: {element.type}")
                continue

            # Process based on element type
            if element.type == "polls":
                processed = await self._process_poll(element)
            elif element.type == "quizzes":
                processed = await self._process_quiz(element)
            elif element.type == "comments":
                processed = await self._process_comments(element)
            elif element.type == "reactions":
                processed = await self._process_reactions(element)
            else:
                processed = element.dict()

            processed_elements.append(processed)

        return processed_elements

    async def _process_poll(self, poll: PollElement) -> Dict[str, Any]:
        """Process and validate poll element."""
        config = self.config["interactive_elements"]["polls"]
        if not config["enabled"]:
            raise ValueError("Polls are not enabled")

        if not (config["min_options"] <= len(poll.options) <= config["max_options"]):
            raise ValueError(f"Poll options must be between {config['min_options']} and {config['max_options']}")

        return {
            "type": "poll",
            "question": poll.question,
            "options": poll.options,
            "expires_at": (datetime.utcnow() + timedelta(hours=config["expiration_hours"])).isoformat()
        }

    async def _process_quiz(self, quiz: QuizElement) -> Dict[str, Any]:
        """Process and validate quiz element."""
        config = self.config["interactive_elements"]["quizzes"]
        if not config["enabled"]:
            raise ValueError("Quizzes are not enabled")

        if not (config["min_questions"] <= len(quiz.questions) <= config["max_questions"]):
            raise ValueError(f"Quiz questions must be between {config['min_questions']} and {config['max_questions']}")

        return {
            "type": "quiz",
            "title": quiz.title,
            "questions": quiz.questions,
            "scoring_enabled": config["scoring_enabled"]
        }

    async def _process_comments(self, comments: CommentElement) -> Dict[str, Any]:
        """Process and validate comments element."""
        config = self.config["interactive_elements"]["comments"]
        if not config["enabled"]:
            raise ValueError("Comments are not enabled")

        return {
            "type": "comments",
            "thread_id": comments.thread_id,
            "moderation_enabled": config["moderation"],
            "max_length": config["max_length"],
            "threading_depth": config["threading_depth"]
        }

    async def _store_content(self, content_id: str, content: Dict[str, Any]) -> str:
        """Store interactive content in Cloud Storage."""
        try:
            bucket = self.storage_client.bucket(self.config["storage"]["bucket"])
            blob_name = os.path.join(
                self.config["storage"]["interactive_prefix"],
                f"{content_id}.json"
            )
            blob = bucket.blob(blob_name)

            # Upload content
            blob.upload_from_string(
                json.dumps(content),
                content_type="application/json"
            )

            # Make public and return URL
            blob.make_public()
            return blob.public_url

        except Exception as e:
            logger.error(f"Error storing content: {str(e)}")
            raise

    async def _publish_result(self, result: Dict[str, Any]) -> None:
        """Publish generation result to Pub/Sub."""
        try:
            topic_path = self.publisher.topic_path(
                os.getenv('GOOGLE_CLOUD_PROJECT'),
                self.config['pubsub']['output_topic']
            )

            data = json.dumps(result).encode('utf-8')
            future = self.publisher.publish(topic_path, data)
            await asyncio.wrap_future(future)

        except Exception as e:
            logger.error(f"Error publishing result: {str(e)}")
            raise

# Initialize service
service = InteractiveContentService()

@app.post("/generate")
async def generate_interactive_content(
    request: InteractiveContentRequest,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """Generate interactive content endpoint."""
    return await service.generate_interactive_content(request)

@app.websocket("/ws/{content_id}")
async def websocket_endpoint(websocket: WebSocket, content_id: str):
    """WebSocket endpoint for real-time interactions."""
    await service.websocket_manager.connect(websocket, content_id)
    try:
        while True:
            data = await websocket.receive_json()
            # Process real-time interaction
            await service.websocket_manager.broadcast(content_id, data)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        await service.websocket_manager.disconnect(websocket, content_id)

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    } 