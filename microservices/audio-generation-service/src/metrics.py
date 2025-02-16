from prometheus_client import Counter, Histogram, Gauge
from typing import Dict, Any

# Audio Generation Metrics
AUDIO_GENERATION_DURATION = Histogram(
    'audio_generation_duration_seconds',
    'Time spent generating audio',
    ['status', 'fallback']
)

AUDIO_GENERATION_TOTAL = Counter(
    'audio_generation_total',
    'Total number of audio generation requests',
    ['status', 'fallback']
)

AUDIO_QUALITY_SCORE = Histogram(
    'audio_quality_score',
    'Quality metrics for generated audio',
    ['metric']
)

# Storage Metrics
STORAGE_OPERATION_DURATION = Histogram(
    'storage_operation_duration_seconds',
    'Time spent on storage operations',
    ['operation', 'status']
)

STORAGE_OPERATION_TOTAL = Counter(
    'storage_operation_total',
    'Total number of storage operations',
    ['operation', 'status']
)

# Pub/Sub Metrics
PUBSUB_OPERATION_DURATION = Histogram(
    'pubsub_operation_duration_seconds',
    'Time spent on Pub/Sub operations',
    ['operation', 'status']
)

PUBSUB_OPERATION_TOTAL = Counter(
    'pubsub_operation_total',
    'Total number of Pub/Sub operations',
    ['operation', 'status']
)

# Resource Metrics
MEMORY_USAGE = Gauge(
    'memory_usage_bytes',
    'Current memory usage of the service'
)

CPU_USAGE = Gauge(
    'cpu_usage_percent',
    'Current CPU usage of the service'
)

ACTIVE_REQUESTS = Gauge(
    'active_requests',
    'Number of currently active requests'
)

class MetricsCollector:
    """Collector for service metrics."""
    
    @staticmethod
    def record_audio_generation(duration: float, success: bool, used_fallback: bool,
                              quality_metrics: Dict[str, Any] = None) -> None:
        """Record metrics for audio generation.
        
        Args:
            duration: Time taken to generate audio in seconds
            success: Whether the generation was successful
            used_fallback: Whether the fallback TTS was used
            quality_metrics: Optional quality metrics
        """
        status = 'success' if success else 'failure'
        fallback = 'true' if used_fallback else 'false'
        
        AUDIO_GENERATION_DURATION.labels(status=status, fallback=fallback).observe(duration)
        AUDIO_GENERATION_TOTAL.labels(status=status, fallback=fallback).inc()
        
        if quality_metrics and success:
            for metric, value in quality_metrics.items():
                if isinstance(value, (int, float)):
                    AUDIO_QUALITY_SCORE.labels(metric=metric).observe(value)
    
    @staticmethod
    def record_storage_operation(operation: str, duration: float, success: bool) -> None:
        """Record metrics for storage operations.
        
        Args:
            operation: Type of storage operation
            duration: Time taken for the operation in seconds
            success: Whether the operation was successful
        """
        status = 'success' if success else 'failure'
        
        STORAGE_OPERATION_DURATION.labels(
            operation=operation,
            status=status
        ).observe(duration)
        
        STORAGE_OPERATION_TOTAL.labels(
            operation=operation,
            status=status
        ).inc()
    
    @staticmethod
    def record_pubsub_operation(operation: str, duration: float, success: bool) -> None:
        """Record metrics for Pub/Sub operations.
        
        Args:
            operation: Type of Pub/Sub operation
            duration: Time taken for the operation in seconds
            success: Whether the operation was successful
        """
        status = 'success' if success else 'failure'
        
        PUBSUB_OPERATION_DURATION.labels(
            operation=operation,
            status=status
        ).observe(duration)
        
        PUBSUB_OPERATION_TOTAL.labels(
            operation=operation,
            status=status
        ).inc()
    
    @staticmethod
    def update_resource_usage(memory_bytes: float, cpu_percent: float) -> None:
        """Update resource usage metrics.
        
        Args:
            memory_bytes: Current memory usage in bytes
            cpu_percent: Current CPU usage percentage
        """
        MEMORY_USAGE.set(memory_bytes)
        CPU_USAGE.set(cpu_percent)
    
    @staticmethod
    def increment_active_requests() -> None:
        """Increment the count of active requests."""
        ACTIVE_REQUESTS.inc()
    
    @staticmethod
    def decrement_active_requests() -> None:
        """Decrement the count of active requests."""
        ACTIVE_REQUESTS.dec()

class MetricsMiddleware:
    """FastAPI middleware for collecting request metrics."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        """Process each request and collect metrics.
        
        Args:
            scope: ASGI scope
            receive: ASGI receive function
            send: ASGI send function
        """
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        
        MetricsCollector.increment_active_requests()
        try:
            return await self.app(scope, receive, send)
        finally:
            MetricsCollector.decrement_active_requests()

def setup_metrics(app):
    """Set up metrics collection for the FastAPI app.
    
    Args:
        app: FastAPI application instance
    """
    app.add_middleware(MetricsMiddleware)
    
    # Start resource usage monitoring
    import psutil
    import asyncio
    
    async def monitor_resources():
        """Monitor system resource usage."""
        while True:
            process = psutil.Process()
            memory_info = process.memory_info()
            cpu_percent = process.cpu_percent()
            
            MetricsCollector.update_resource_usage(
                memory_bytes=memory_info.rss,
                cpu_percent=cpu_percent
            )
            
            await asyncio.sleep(15)  # Update every 15 seconds
    
    @app.on_event("startup")
    async def start_resource_monitoring():
        """Start the resource monitoring task."""
        asyncio.create_task(monitor_resources()) 