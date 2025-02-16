import os
import logging
import google.cloud.logging
from pythonjsonlogger import jsonlogger

def setup_logging():
    """Setup structured logging with Google Cloud Logging."""
    # Initialize Google Cloud Logging
    if os.getenv('GOOGLE_CLOUD_PROJECT'):
        client = google.cloud.logging.Client()
        client.setup_logging()

    # Create custom JSON formatter
    class CustomJsonFormatter(jsonlogger.JsonFormatter):
        def add_fields(self, log_record, record, message_dict):
            super(CustomJsonFormatter, self).add_fields(log_record, record, message_dict)
            log_record['severity'] = record.levelname
            log_record['service'] = 'visual-generation-service'
            log_record['timestamp'] = self.formatTime(record)

    # Create logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Add JSON handler if not running in Google Cloud
    if not os.getenv('GOOGLE_CLOUD_PROJECT'):
        handler = logging.StreamHandler()
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(severity)s %(service)s %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name."""
    return logging.getLogger(name) 