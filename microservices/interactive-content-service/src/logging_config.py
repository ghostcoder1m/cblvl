import logging
import json
from typing import Any, Dict
from google.cloud import logging as cloud_logging
from pythonjsonlogger import jsonlogger
import os
from datetime import datetime

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter for structured logging."""
    
    def add_fields(
        self,
        log_record: Dict[str, Any],
        record: logging.LogRecord,
        message_dict: Dict[str, Any]
    ) -> None:
        """
        Add custom fields to the log record.
        
        Args:
            log_record: The log record to add fields to
            record: The original logging record
            message_dict: Additional message dictionary
        """
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp if not present
        if not log_record.get('timestamp'):
            log_record['timestamp'] = datetime.utcnow().isoformat()
        
        # Add log level
        if log_record.get('level'):
            log_record['level'] = log_record['level'].upper()
        else:
            log_record['level'] = record.levelname
            
        # Add service context
        log_record['service'] = 'interactive-content-service'
        log_record['version'] = os.getenv('SERVICE_VERSION', 'unknown')
        
        # Add trace context if available
        trace_id = os.getenv('CLOUD_TRACE_CONTEXT')
        if trace_id:
            log_record['logging.googleapis.com/trace'] = trace_id

class ContextFilter(logging.Filter):
    """Filter for adding contextual information to log records."""
    
    def __init__(self, service_name: str):
        """
        Initialize the context filter.
        
        Args:
            service_name: Name of the service for context
        """
        super().__init__()
        self.service_name = service_name

    def filter(self, record: logging.LogRecord) -> bool:
        """
        Add context to the log record.
        
        Args:
            record: The log record to add context to
            
        Returns:
            True to include the record in log output
        """
        record.service_name = self.service_name
        record.environment = os.getenv('ENVIRONMENT', 'development')
        return True

def setup_logging() -> None:
    """Configure logging for the service."""
    # Initialize Google Cloud Logging
    if os.getenv('ENVIRONMENT') == 'production':
        cloud_client = cloud_logging.Client()
        cloud_client.setup_logging()

    # Create formatter
    formatter = CustomJsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s'
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Add console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Add context filter
    context_filter = ContextFilter('interactive-content-service')
    root_logger.addFilter(context_filter)

    # Set logging levels for third-party libraries
    logging.getLogger('google').setLevel(logging.WARNING)
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.
    
    Args:
        name: Name for the logger
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Add correlation ID if available
    correlation_id = os.getenv('CORRELATION_ID')
    if correlation_id:
        logger = logging.LoggerAdapter(
            logger,
            {'correlation_id': correlation_id}
        )
    
    return logger

class LoggerAdapter(logging.LoggerAdapter):
    """Custom logger adapter for adding context to log messages."""
    
    def process(
        self,
        msg: str,
        kwargs: Dict[str, Any]
    ) -> tuple[str, Dict[str, Any]]:
        """
        Process the logging message and keyword arguments.
        
        Args:
            msg: The log message
            kwargs: Additional keyword arguments
            
        Returns:
            Tuple of processed message and kwargs
        """
        # Add extra context to the message
        extra = kwargs.get('extra', {})
        extra.update(self.extra)
        
        # Add timestamp if not present
        if 'timestamp' not in extra:
            extra['timestamp'] = datetime.utcnow().isoformat()
            
        kwargs['extra'] = extra
        return msg, kwargs

def log_function_call(logger: logging.Logger):
    """
    Decorator for logging function calls.
    
    Args:
        logger: Logger instance to use
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            function_name = func.__name__
            logger.debug(
                f"Calling {function_name}",
                extra={
                    'function': function_name,
                    'args': args,
                    'kwargs': kwargs
                }
            )
            try:
                result = func(*args, **kwargs)
                logger.debug(
                    f"{function_name} completed successfully",
                    extra={
                        'function': function_name,
                        'result': result
                    }
                )
                return result
            except Exception as e:
                logger.error(
                    f"Error in {function_name}: {str(e)}",
                    extra={
                        'function': function_name,
                        'error': str(e)
                    },
                    exc_info=True
                )
                raise
        return wrapper
    return decorator 