import os
import logging
import json
from pythonjsonlogger import jsonlogger
from google.cloud import logging as cloud_logging

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
        log_record['severity'] = record.levelname
        log_record['service'] = 'audio-generation-service'
        log_record['timestamp'] = self.formatTime(record)

def setup_logging():
    """Configure logging for both local development and Cloud Logging."""
    
    # Determine if running in GCP environment
    in_gcp = os.getenv('KUBERNETES_SERVICE_HOST') is not None
    
    # Set up root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Remove existing handlers
    root_logger.handlers = []
    
    if in_gcp:
        # Initialize Cloud Logging client
        cloud_logging_client = cloud_logging.Client()
        cloud_handler = cloud_logging.handlers.CloudLoggingHandler(cloud_logging_client)
        
        # Configure formatter for structured logging
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(severity)s %(service)s %(name)s %(message)s'
        )
        cloud_handler.setFormatter(formatter)
        
        # Add handler to root logger
        root_logger.addHandler(cloud_handler)
        
        # Set logging level for google.cloud modules
        logging.getLogger('google.cloud').setLevel(logging.WARNING)
        logging.getLogger('google.auth').setLevel(logging.WARNING)
    else:
        # Configure console handler for local development
        console_handler = logging.StreamHandler()
        
        # Configure formatter for local development
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(severity)s %(service)s %(name)s %(message)s'
        )
        console_handler.setFormatter(formatter)
        
        # Add handler to root logger
        root_logger.addHandler(console_handler)

def get_logger(name):
    """Get a logger instance with the specified name."""
    return logging.getLogger(name)

class LoggerAdapter(logging.LoggerAdapter):
    """Custom logger adapter to add context to log messages."""
    
    def __init__(self, logger, extra=None):
        super().__init__(logger, extra or {})
    
    def process(self, msg, kwargs):
        # Add trace ID if available
        trace_id = self.extra.get('trace_id')
        if trace_id:
            kwargs.setdefault('extra', {})['trace_id'] = trace_id
        
        # Add request ID if available
        request_id = self.extra.get('request_id')
        if request_id:
            kwargs.setdefault('extra', {})['request_id'] = request_id
        
        return msg, kwargs

def get_logger_with_context(name, trace_id=None, request_id=None):
    """Get a logger instance with added context."""
    logger = get_logger(name)
    extra = {}
    
    if trace_id:
        extra['trace_id'] = trace_id
    if request_id:
        extra['request_id'] = request_id
    
    return LoggerAdapter(logger, extra)

# Metrics logging
class MetricsLogger:
    """Helper class for logging metrics."""
    
    def __init__(self, logger):
        self.logger = logger
    
    def log_audio_generation_metrics(self, duration_ms, success, used_fallback=False,
                                   audio_quality=None, error=None):
        """Log metrics for audio generation."""
        metrics = {
            'event_type': 'audio_generation',
            'duration_ms': duration_ms,
            'success': success,
            'used_fallback': used_fallback
        }
        
        if audio_quality:
            metrics['audio_quality'] = audio_quality
        
        if error:
            metrics['error'] = str(error)
        
        self.logger.info('Audio generation metrics', extra={'metrics': metrics})
    
    def log_storage_metrics(self, operation, duration_ms, success, error=None):
        """Log metrics for storage operations."""
        metrics = {
            'event_type': 'storage_operation',
            'operation': operation,
            'duration_ms': duration_ms,
            'success': success
        }
        
        if error:
            metrics['error'] = str(error)
        
        self.logger.info('Storage operation metrics', extra={'metrics': metrics})
    
    def log_pubsub_metrics(self, operation, duration_ms, success, error=None):
        """Log metrics for Pub/Sub operations."""
        metrics = {
            'event_type': 'pubsub_operation',
            'operation': operation,
            'duration_ms': duration_ms,
            'success': success
        }
        
        if error:
            metrics['error'] = str(error)
        
        self.logger.info('Pub/Sub operation metrics', extra={'metrics': metrics})

# Initialize logging when module is imported
setup_logging() 