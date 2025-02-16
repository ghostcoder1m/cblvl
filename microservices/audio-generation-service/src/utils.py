import os
import uuid
import time
import json
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import soundfile as sf
import numpy as np
from google.cloud import storage
from google.cloud import pubsub_v1
from google.api_core import retry

from .logging_config import get_logger_with_context

logger = get_logger_with_context(__name__)

def generate_unique_filename(text: str, format: str) -> str:
    """Generate a unique filename for the audio file.
    
    Args:
        text: The text being converted to audio
        format: The audio file format (e.g., 'mp3', 'wav')
        
    Returns:
        A unique filename with timestamp and UUID
    """
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8]
    safe_text = text[:30].replace(' ', '_').lower()  # First 30 chars, spaces to underscores
    return f"{timestamp}_{safe_text}_{unique_id}.{format}"

def check_audio_quality(audio_data: bytes, sample_rate: int) -> Tuple[bool, Dict[str, Any]]:
    """Check the quality of the generated audio.
    
    Args:
        audio_data: Raw audio data
        sample_rate: The sample rate of the audio
        
    Returns:
        Tuple of (passed_quality_check, quality_metrics)
    """
    try:
        # Convert bytes to numpy array
        audio_array, file_sample_rate = sf.read(audio_data)
        
        # Calculate quality metrics
        duration = len(audio_array) / file_sample_rate
        max_amplitude = np.max(np.abs(audio_array))
        rms = np.sqrt(np.mean(np.square(audio_array)))
        
        # Check for silence or very low volume
        silence_threshold = 0.01
        is_silent = rms < silence_threshold
        
        # Calculate signal-to-noise ratio
        noise_floor = np.mean(np.abs(audio_array[audio_array < silence_threshold]))
        snr = 20 * np.log10(max_amplitude / noise_floor) if noise_floor > 0 else float('inf')
        
        # Quality metrics
        quality_metrics = {
            'duration': duration,
            'sample_rate': file_sample_rate,
            'max_amplitude': float(max_amplitude),
            'rms_volume': float(rms),
            'signal_to_noise_ratio': float(snr),
            'is_silent': is_silent
        }
        
        # Quality checks
        passed_checks = (
            file_sample_rate >= sample_rate and  # Sample rate meets minimum
            not is_silent and                    # Not silent
            snr >= 20.0 and                      # Good signal-to-noise ratio
            0.1 <= max_amplitude <= 0.95         # Good dynamic range
        )
        
        return passed_checks, quality_metrics
        
    except Exception as e:
        logger.error(f"Error checking audio quality: {str(e)}")
        return False, {'error': str(e)}

@retry.Retry(predicate=retry.if_exception_type(Exception))
def upload_to_storage(bucket_name: str, blob_name: str, data: bytes,
                     content_type: str) -> str:
    """Upload audio file to Google Cloud Storage with retry logic.
    
    Args:
        bucket_name: The name of the GCS bucket
        blob_name: The name of the blob (file) in the bucket
        data: The audio data to upload
        content_type: The content type of the file (e.g., 'audio/mp3')
        
    Returns:
        The public URL of the uploaded file
    """
    try:
        start_time = time.time()
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        # Upload the file
        blob.upload_from_string(data, content_type=content_type)
        
        # Make the blob publicly readable
        blob.make_public()
        
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Successfully uploaded {blob_name} to {bucket_name}",
                   extra={'duration_ms': duration_ms})
        
        return blob.public_url
        
    except Exception as e:
        logger.error(f"Error uploading to storage: {str(e)}")
        raise

@retry.Retry(predicate=retry.if_exception_type(Exception))
def publish_message(project_id: str, topic_id: str, message_data: Dict[str, Any],
                   attributes: Optional[Dict[str, str]] = None) -> str:
    """Publish a message to Pub/Sub with retry logic.
    
    Args:
        project_id: The GCP project ID
        topic_id: The Pub/Sub topic ID
        message_data: The message data to publish
        attributes: Optional message attributes
        
    Returns:
        The published message ID
    """
    try:
        start_time = time.time()
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, topic_id)
        
        # Convert message data to JSON string
        message_json = json.dumps(message_data)
        
        # Publish the message
        future = publisher.publish(topic_path, message_json.encode('utf-8'),
                                 **attributes if attributes else {})
        message_id = future.result()
        
        duration_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Successfully published message {message_id} to {topic_id}",
                   extra={'duration_ms': duration_ms})
        
        return message_id
        
    except Exception as e:
        logger.error(f"Error publishing message: {str(e)}")
        raise

def get_content_type(format: str) -> str:
    """Get the MIME content type for an audio format.
    
    Args:
        format: The audio format (e.g., 'mp3', 'wav')
        
    Returns:
        The corresponding MIME type
    """
    content_types = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac'
    }
    return content_types.get(format.lower(), 'application/octet-stream')

def validate_audio_format(format: str) -> bool:
    """Validate if the audio format is supported.
    
    Args:
        format: The audio format to validate
        
    Returns:
        True if the format is supported, False otherwise
    """
    supported_formats = {'mp3', 'wav', 'ogg', 'flac'}
    return format.lower() in supported_formats

def calculate_chunk_size(text: str, max_chars: int = 5000) -> list[str]:
    """Split text into chunks for processing.
    
    Args:
        text: The text to split into chunks
        max_chars: Maximum characters per chunk
        
    Returns:
        List of text chunks
    """
    # Split text into sentences
    sentences = text.split('. ')
    chunks = []
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        sentence = sentence.strip() + '. '
        sentence_length = len(sentence)
        
        if current_length + sentence_length > max_chars:
            if current_chunk:
                chunks.append(''.join(current_chunk))
                current_chunk = [sentence]
                current_length = sentence_length
            else:
                # If a single sentence is longer than max_chars, split it
                chunks.append(sentence[:max_chars])
                remaining = sentence[max_chars:]
                while remaining:
                    chunks.append(remaining[:max_chars])
                    remaining = remaining[max_chars:]
        else:
            current_chunk.append(sentence)
            current_length += sentence_length
    
    if current_chunk:
        chunks.append(''.join(current_chunk))
    
    return chunks

def format_duration(duration_seconds: float) -> str:
    """Format duration in seconds to HH:MM:SS format.
    
    Args:
        duration_seconds: Duration in seconds
        
    Returns:
        Formatted duration string
    """
    hours = int(duration_seconds // 3600)
    minutes = int((duration_seconds % 3600) // 60)
    seconds = int(duration_seconds % 60)
    
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}" 