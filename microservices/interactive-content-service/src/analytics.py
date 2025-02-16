from typing import Dict, Any, List, Optional
import logging
from logging_config import get_logger
import json
from datetime import datetime, timedelta
from google.cloud import bigquery
from google.cloud import pubsub_v1
import asyncio
from concurrent.futures import ThreadPoolExecutor
import os

logger = get_logger(__name__)

class AnalyticsTracker:
    """Tracks and processes analytics events for interactive content."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the analytics tracker.
        
        Args:
            config: Configuration dictionary for analytics settings
        """
        self.config = config
        self.bigquery_client = bigquery.Client()
        self.publisher = pubsub_v1.PublisherClient()
        self.executor = ThreadPoolExecutor(max_workers=4)
        self._initialize_schema()
        logger.info("Analytics tracker initialized")

    def _initialize_schema(self) -> None:
        """Initialize BigQuery schema for analytics data."""
        self.event_schema = [
            bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("content_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("event_type", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("user_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("element_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("element_type", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("interaction_data", "JSON", mode="NULLABLE"),
            bigquery.SchemaField("session_id", "STRING", mode="NULLABLE"),
            bigquery.SchemaField("client_info", "JSON", mode="NULLABLE")
        ]

    async def track_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> None:
        """
        Track an analytics event.
        
        Args:
            event_type: Type of event to track
            data: Event data
            user_id: Optional user identifier
            session_id: Optional session identifier
        """
        if not self.config["enabled"]:
            logger.debug("Analytics tracking is disabled")
            return

        try:
            # Validate event type
            if event_type not in self.config["tracking_events"]:
                logger.warning(f"Unsupported event type: {event_type}")
                return

            # Prepare event data
            event = {
                "event_id": f"{event_type}_{datetime.utcnow().timestamp()}",
                "content_id": data.get("content_id"),
                "event_type": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "user_id": user_id,
                "element_id": data.get("element_id"),
                "element_type": data.get("element_type"),
                "interaction_data": json.dumps(data),
                "session_id": session_id,
                "client_info": json.dumps(self._get_client_info(data))
            }

            # Store event
            await self._store_event(event)

            # Publish event for real-time processing
            await self._publish_event(event)

        except Exception as e:
            logger.error(f"Error tracking analytics event: {str(e)}")

    async def _store_event(self, event: Dict[str, Any]) -> None:
        """Store event in BigQuery."""
        try:
            table_id = f"{os.getenv('GOOGLE_CLOUD_PROJECT')}.analytics.interactive_events"
            
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._insert_rows,
                table_id,
                [event]
            )

        except Exception as e:
            logger.error(f"Error storing analytics event: {str(e)}")

    def _insert_rows(self, table_id: str, rows: List[Dict[str, Any]]) -> None:
        """Insert rows into BigQuery (runs in thread pool)."""
        try:
            errors = self.bigquery_client.insert_rows_json(
                table_id,
                rows,
                row_ids=[row["event_id"] for row in rows]
            )
            if errors:
                logger.error(f"Error inserting rows: {errors}")
        except Exception as e:
            logger.error(f"Error in BigQuery insertion: {str(e)}")

    async def _publish_event(self, event: Dict[str, Any]) -> None:
        """Publish event to Pub/Sub for real-time processing."""
        try:
            topic_path = self.publisher.topic_path(
                os.getenv('GOOGLE_CLOUD_PROJECT'),
                'interactive-analytics-events'
            )
            
            data = json.dumps(event).encode('utf-8')
            future = self.publisher.publish(topic_path, data)
            await asyncio.wrap_future(future)

        except Exception as e:
            logger.error(f"Error publishing analytics event: {str(e)}")

    def _get_client_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract client information from event data."""
        return {
            "user_agent": data.get("user_agent"),
            "ip_address": data.get("ip_address"),
            "device_type": data.get("device_type"),
            "platform": data.get("platform"),
            "locale": data.get("locale"),
            "referrer": data.get("referrer")
        }

    async def get_content_metrics(
        self,
        content_id: str,
        time_range: Optional[timedelta] = None
    ) -> Dict[str, Any]:
        """
        Get metrics for specific content.
        
        Args:
            content_id: ID of the content to get metrics for
            time_range: Optional time range to limit results
            
        Returns:
            Dict containing content metrics
        """
        try:
            # Set default time range to last 30 days if not specified
            if time_range is None:
                time_range = timedelta(days=30)

            start_time = datetime.utcnow() - time_range
            
            query = f"""
                SELECT
                    event_type,
                    COUNT(*) as count,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT session_id) as unique_sessions
                FROM `{os.getenv('GOOGLE_CLOUD_PROJECT')}.analytics.interactive_events`
                WHERE content_id = @content_id
                AND timestamp >= @start_time
                GROUP BY event_type
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("content_id", "STRING", content_id),
                    bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time)
                ]
            )
            
            # Run query in thread pool
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                self._execute_query,
                query,
                job_config
            )
            
            # Process results
            metrics = {
                "content_id": content_id,
                "time_range": str(time_range),
                "total_interactions": 0,
                "unique_users": 0,
                "unique_sessions": 0,
                "events_breakdown": {}
            }
            
            for row in results:
                metrics["events_breakdown"][row.event_type] = {
                    "count": row.count,
                    "unique_users": row.unique_users,
                    "unique_sessions": row.unique_sessions
                }
                metrics["total_interactions"] += row.count
                metrics["unique_users"] = max(metrics["unique_users"], row.unique_users)
                metrics["unique_sessions"] = max(metrics["unique_sessions"], row.unique_sessions)
            
            return metrics

        except Exception as e:
            logger.error(f"Error getting content metrics: {str(e)}")
            return {
                "content_id": content_id,
                "error": str(e)
            }

    def _execute_query(
        self,
        query: str,
        job_config: bigquery.QueryJobConfig
    ) -> List[bigquery.Row]:
        """Execute BigQuery query (runs in thread pool)."""
        try:
            query_job = self.bigquery_client.query(query, job_config=job_config)
            return list(query_job.result())
        except Exception as e:
            logger.error(f"Error executing BigQuery query: {str(e)}")
            return []

    async def get_realtime_metrics(
        self,
        content_id: str,
        window_minutes: int = 5
    ) -> Dict[str, Any]:
        """
        Get real-time metrics for specific content.
        
        Args:
            content_id: ID of the content to get metrics for
            window_minutes: Time window in minutes for real-time data
            
        Returns:
            Dict containing real-time metrics
        """
        try:
            start_time = datetime.utcnow() - timedelta(minutes=window_minutes)
            
            query = f"""
                SELECT
                    event_type,
                    TIMESTAMP_TRUNC(timestamp, MINUTE) as minute,
                    COUNT(*) as count
                FROM `{os.getenv('GOOGLE_CLOUD_PROJECT')}.analytics.interactive_events`
                WHERE content_id = @content_id
                AND timestamp >= @start_time
                GROUP BY event_type, minute
                ORDER BY minute ASC
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("content_id", "STRING", content_id),
                    bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time)
                ]
            )
            
            # Run query in thread pool
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                self._execute_query,
                query,
                job_config
            )
            
            # Process results
            metrics = {
                "content_id": content_id,
                "window_minutes": window_minutes,
                "current_active_users": 0,  # Will be updated from session data
                "events_timeline": {},
                "total_events": 0
            }
            
            for row in results:
                if row.event_type not in metrics["events_timeline"]:
                    metrics["events_timeline"][row.event_type] = []
                
                metrics["events_timeline"][row.event_type].append({
                    "timestamp": row.minute.isoformat(),
                    "count": row.count
                })
                metrics["total_events"] += row.count
            
            # Get current active users
            metrics["current_active_users"] = await self._get_active_users(
                content_id,
                timedelta(minutes=5)  # Active in last 5 minutes
            )
            
            return metrics

        except Exception as e:
            logger.error(f"Error getting realtime metrics: {str(e)}")
            return {
                "content_id": content_id,
                "error": str(e)
            }

    async def _get_active_users(
        self,
        content_id: str,
        active_window: timedelta
    ) -> int:
        """Get number of active users for content."""
        try:
            start_time = datetime.utcnow() - active_window
            
            query = f"""
                SELECT COUNT(DISTINCT user_id) as active_users
                FROM `{os.getenv('GOOGLE_CLOUD_PROJECT')}.analytics.interactive_events`
                WHERE content_id = @content_id
                AND timestamp >= @start_time
                AND user_id IS NOT NULL
            """
            
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("content_id", "STRING", content_id),
                    bigquery.ScalarQueryParameter("start_time", "TIMESTAMP", start_time)
                ]
            )
            
            # Run query in thread pool
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                self._execute_query,
                query,
                job_config
            )
            
            return next(results).active_users if results else 0

        except Exception as e:
            logger.error(f"Error getting active users: {str(e)}")
            return 0 