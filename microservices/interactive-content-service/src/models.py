from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class InteractiveElement(BaseModel):
    """Base model for interactive elements."""
    type: str = Field(..., description="Type of interactive element")
    id: str = Field(..., description="Unique identifier for the element")
    position: Dict[str, int] = Field(
        ...,
        description="Position information for element placement"
    )
    styles: Optional[Dict[str, str]] = Field(
        default=None,
        description="Custom CSS styles for the element"
    )
    metadata: Optional[Dict[str, Any]] = None

class PollElement(InteractiveElement):
    """Model for poll elements."""
    type: str = "polls"
    question: str = Field(..., description="Poll question")
    options: List[str] = Field(..., description="List of poll options")
    multiple_choice: bool = Field(
        default=False,
        description="Whether multiple options can be selected"
    )
    results_visibility: str = Field(
        default="after_vote",
        description="When to show results (always, after_vote, never)"
    )

class QuizElement(InteractiveElement):
    """Model for quiz elements."""
    type: str = "quizzes"
    title: str = Field(..., description="Quiz title")
    description: Optional[str] = None
    questions: List[Dict[str, Any]] = Field(
        ...,
        description="List of quiz questions with options and correct answers"
    )
    shuffle_questions: bool = Field(
        default=True,
        description="Whether to randomize question order"
    )
    show_correct_answers: bool = Field(
        default=True,
        description="Whether to show correct answers after completion"
    )

class CommentElement(InteractiveElement):
    """Model for comment elements."""
    type: str = "comments"
    thread_id: str = Field(..., description="Unique identifier for comment thread")
    title: Optional[str] = None
    initial_comments: List[Dict[str, Any]] = Field(
        default=[],
        description="Initial comments to populate the thread"
    )
    allow_replies: bool = Field(
        default=True,
        description="Whether replies to comments are allowed"
    )
    sort_order: str = Field(
        default="newest",
        description="Default sort order for comments (newest, oldest, most_liked)"
    )

class ReactionElement(InteractiveElement):
    """Model for reaction elements."""
    type: str = "reactions"
    enabled_reactions: List[str] = Field(
        ...,
        description="List of enabled reaction types"
    )
    allow_multiple: bool = Field(
        default=True,
        description="Whether users can select multiple reactions"
    )
    show_counts: bool = Field(
        default=True,
        description="Whether to show reaction counts"
    )

class EmbeddedMediaElement(InteractiveElement):
    """Model for embedded media elements."""
    type: str = "embedded_media"
    media_type: str = Field(
        ...,
        description="Type of media (image, video, audio, iframe)"
    )
    url: str = Field(..., description="URL of the media content")
    title: Optional[str] = None
    description: Optional[str] = None
    autoplay: bool = Field(
        default=False,
        description="Whether media should autoplay"
    )
    controls: bool = Field(
        default=True,
        description="Whether to show media controls"
    )

class InteractionEvent(BaseModel):
    """Model for tracking user interactions with elements."""
    event_id: str = Field(..., description="Unique identifier for the event")
    content_id: str = Field(..., description="ID of the interactive content")
    element_id: str = Field(..., description="ID of the interactive element")
    event_type: str = Field(..., description="Type of interaction event")
    user_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Dict[str, Any] = Field(
        ...,
        description="Event-specific data (e.g., selected option for polls)"
    )
    metadata: Optional[Dict[str, Any]] = None

class InteractionResponse(BaseModel):
    """Model for interaction response data."""
    success: bool = Field(..., description="Whether the interaction was successful")
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow) 