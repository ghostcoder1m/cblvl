from typing import Dict, Any, List, Optional
import logging
from logging_config import get_logger
import json
import aiohttp
from datetime import datetime, timedelta
import re
from google.cloud import language_v1
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = get_logger(__name__)

class ContentModerator:
    """Handles content moderation and safety checks."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the content moderator.
        
        Args:
            config: Configuration dictionary for moderation settings
        """
        self.config = config
        self.language_client = language_v1.LanguageServiceClient()
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        logger.info("Content moderator initialized")

    async def moderate_content(
        self,
        content: str,
        content_type: str = "text",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Moderate content for safety and quality.
        
        Args:
            content: The content to moderate
            content_type: Type of content (text, comment, poll_option, etc.)
            metadata: Additional metadata about the content
            
        Returns:
            Dict containing moderation results
        """
        try:
            # Check cache first
            cache_key = f"{content_type}:{hash(content)}"
            cached_result = self._check_cache(cache_key)
            if cached_result:
                logger.debug("Using cached moderation result")
                return cached_result

            # Initialize result structure
            result = {
                "timestamp": datetime.utcnow().isoformat(),
                "content_type": content_type,
                "is_safe": True,
                "flags": [],
                "scores": {},
                "metadata": metadata or {}
            }

            # Run moderation checks
            toxicity_score = await self._check_toxicity(content)
            sentiment_score = await self._analyze_sentiment(content)
            spam_score = await self._check_spam(content)
            
            result["scores"] = {
                "toxicity": toxicity_score,
                "sentiment": sentiment_score,
                "spam": spam_score
            }

            # Apply thresholds and update flags
            if toxicity_score > self.config["toxicity_threshold"]:
                result["flags"].append("toxic_content")
                result["is_safe"] = False

            if spam_score > self.config["spam_threshold"]:
                result["flags"].append("potential_spam")
                result["is_safe"] = False

            if sentiment_score < -0.7:  # High negative sentiment
                result["flags"].append("negative_content")

            # Additional content-type specific checks
            if content_type == "comment":
                await self._moderate_comment(content, result)
            elif content_type == "poll_option":
                await self._moderate_poll_option(content, result)

            # Cache the result
            self._cache_result(cache_key, result)

            return result

        except Exception as e:
            logger.error(f"Error during content moderation: {str(e)}")
            # Return safe default in case of error
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "content_type": content_type,
                "is_safe": False,
                "flags": ["moderation_error"],
                "scores": {},
                "metadata": metadata or {}
            }

    async def _check_toxicity(self, content: str) -> float:
        """Check content toxicity using Cloud Natural Language API."""
        try:
            document = language_v1.Document(
                content=content,
                type_=language_v1.Document.Type.PLAIN_TEXT
            )
            
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                self._analyze_toxicity,
                document
            )
            
            return result

        except Exception as e:
            logger.error(f"Error checking toxicity: {str(e)}")
            return 0.0

    def _analyze_toxicity(self, document: language_v1.Document) -> float:
        """Analyze document toxicity (runs in thread pool)."""
        try:
            result = self.language_client.analyze_sentiment(
                request={"document": document}
            )
            # Convert sentiment to toxicity score (inverse relationship)
            return max(0.0, 1.0 - (result.document_sentiment.score + 1) / 2)
        except Exception as e:
            logger.error(f"Error in toxicity analysis: {str(e)}")
            return 0.0

    async def _analyze_sentiment(self, content: str) -> float:
        """Analyze content sentiment."""
        try:
            document = language_v1.Document(
                content=content,
                type_=language_v1.Document.Type.PLAIN_TEXT
            )
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                self._get_sentiment,
                document
            )
            
            return result

        except Exception as e:
            logger.error(f"Error analyzing sentiment: {str(e)}")
            return 0.0

    def _get_sentiment(self, document: language_v1.Document) -> float:
        """Get document sentiment (runs in thread pool)."""
        try:
            result = self.language_client.analyze_sentiment(
                request={"document": document}
            )
            return result.document_sentiment.score
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {str(e)}")
            return 0.0

    async def _check_spam(self, content: str) -> float:
        """Check if content is likely spam."""
        # Simple spam detection heuristics
        spam_indicators = [
            r'\b(buy|sell|discount|offer|price|deal)\b',
            r'https?://\S+',
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            r'\b\d{1,4}-\d{1,4}-\d{1,4}\b'  # Phone number patterns
        ]
        
        spam_score = 0.0
        content_lower = content.lower()
        
        # Check for spam patterns
        for pattern in spam_indicators:
            matches = len(re.findall(pattern, content_lower))
            if matches > 0:
                spam_score += 0.2 * matches

        # Check for repeated characters
        if re.search(r'(.)\1{4,}', content):
            spam_score += 0.3

        # Normalize score
        return min(1.0, spam_score)

    async def _moderate_comment(
        self,
        content: str,
        result: Dict[str, Any]
    ) -> None:
        """Apply comment-specific moderation rules."""
        # Check for excessive formatting
        if content.count('*') > 10 or content.count('_') > 10:
            result["flags"].append("excessive_formatting")

        # Check for all caps
        if len(content) > 20 and content.isupper():
            result["flags"].append("all_caps")

        # Check for comment length
        if len(content) > self.config.get("max_length", 1000):
            result["flags"].append("too_long")

    async def _moderate_poll_option(
        self,
        content: str,
        result: Dict[str, Any]
    ) -> None:
        """Apply poll option-specific moderation rules."""
        # Check for minimum length
        if len(content) < 2:
            result["flags"].append("too_short")
            result["is_safe"] = False

        # Check for duplicate options
        if content.lower() in self.cache.get("poll_options", set()):
            result["flags"].append("duplicate_option")

    def _check_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Check if content moderation result is cached."""
        if cache_key in self.cache:
            cached = self.cache[cache_key]
            if datetime.fromisoformat(cached["timestamp"]) + timedelta(
                seconds=self.config["cache_duration"]
            ) > datetime.utcnow():
                return cached
            else:
                del self.cache[cache_key]
        return None

    def _cache_result(self, cache_key: str, result: Dict[str, Any]) -> None:
        """Cache moderation result."""
        self.cache[cache_key] = result
        
        # Clean up old cache entries
        current_time = datetime.utcnow()
        self.cache = {
            k: v for k, v in self.cache.items()
            if datetime.fromisoformat(v["timestamp"]) + timedelta(
                seconds=self.config["cache_duration"]
            ) > current_time
        } 