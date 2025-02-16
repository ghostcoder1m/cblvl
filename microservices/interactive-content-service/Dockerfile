# Use Python 3.9 slim image as base
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code and configuration
COPY src/ src/
COPY config/ config/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV ENVIRONMENT=production
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/config/service-account.json

# Expose the port the app runs on
EXPOSE ${PORT}

# Command to run the service
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "${PORT}"] 