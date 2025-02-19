import logging
import google.cloud.logging
from google.cloud.logging.handlers import CloudLoggingHandler
import os

def setup_logging():
    """Set up logging configuration for both local and cloud logging."""
    # Create logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Clear any existing handlers
    logger.handlers = []

    # Create console handler with a higher log level
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(formatter)
    
    # Add console handler to the logger
    logger.addHandler(console_handler)

    # Set up Google Cloud Logging if credentials are available
    if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        try:
            client = google.cloud.logging.Client()
            cloud_handler = CloudLoggingHandler(client)
            cloud_handler.setLevel(logging.INFO)
            logger.addHandler(cloud_handler)
            logger.info("Google Cloud Logging initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize Google Cloud Logging: {str(e)}")
    else:
        logger.info("Google Cloud Logging not configured - using local logging only")

def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the specified name."""
    return logging.getLogger(name) 