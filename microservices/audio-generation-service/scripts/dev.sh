#!/bin/bash
set -e

# Configuration
VENV_DIR="venv"
PYTHON="python3.9"
SERVICE_NAME="audio-generation-service"

# Print header
echo "Audio Generation Service - Development Environment Setup"
echo "===================================================="

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Python version
if ! command_exists ${PYTHON}; then
    echo "Error: ${PYTHON} is required but not installed."
    echo "Please install Python 3.9 and try again."
    exit 1
fi

# Check if running in the correct directory
if [ ! -f "requirements.txt" ]; then
    echo "Error: requirements.txt not found."
    echo "Please run this script from the service root directory."
    exit 1
fi

# Create and activate virtual environment if it doesn't exist
if [ ! -d "${VENV_DIR}" ]; then
    echo "Creating virtual environment..."
    ${PYTHON} -m venv ${VENV_DIR}
fi

# Determine the correct activate script based on OS
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    source ${VENV_DIR}/bin/activate
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    source ${VENV_DIR}/Scripts/activate
else
    echo "Error: Unsupported operating system."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Install development dependencies
echo "Installing development dependencies..."
pip install pytest pytest-asyncio pytest-cov black flake8 mypy

# Set up pre-commit hooks
if command_exists pre-commit; then
    echo "Setting up pre-commit hooks..."
    pre-commit install
else
    echo "Warning: pre-commit not installed. Skipping hook setup."
fi

# Create necessary directories
mkdir -p src/tests
mkdir -p logs
mkdir -p tmp/audio

# Set up environment variables for local development
export PYTHONPATH="${PYTHONPATH:+${PYTHONPATH}:}$(pwd)"
export GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT:-"local-dev-project"}
export STORAGE_BUCKET=${STORAGE_BUCKET:-"local-dev-bucket"}
export PUBSUB_OUTPUT_TOPIC=${PUBSUB_OUTPUT_TOPIC:-"local-dev-topic"}
export LOG_LEVEL=${LOG_LEVEL:-"DEBUG"}

# Function to run tests
run_tests() {
    echo "Running tests..."
    pytest tests/ -v --cov=src --cov-report=term-missing
}

# Function to run linting
run_linting() {
    echo "Running linting..."
    black src/ tests/
    flake8 src/ tests/
    mypy src/ tests/
}

# Function to start the service
start_service() {
    echo "Starting the service..."
    uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
}

# Function to show help
show_help() {
    echo "Available commands:"
    echo "  test      - Run tests"
    echo "  lint      - Run linting"
    echo "  start     - Start the service"
    echo "  clean     - Clean temporary files"
    echo "  help      - Show this help message"
}

# Function to clean temporary files
clean() {
    echo "Cleaning temporary files..."
    rm -rf tmp/* logs/* .pytest_cache .coverage
    find . -type d -name "__pycache__" -exec rm -r {} +
}

# Process command line arguments
case "$1" in
    "test")
        run_tests
        ;;
    "lint")
        run_linting
        ;;
    "start")
        start_service
        ;;
    "clean")
        clean
        ;;
    "help")
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            start_service
        else
            echo "Unknown command: $1"
            show_help
            exit 1
        fi
        ;;
esac

# Print completion message
echo "Development environment is ready!"
echo "Run './scripts/dev.sh help' to see available commands." 