#!/bin/bash
set -e

# Configuration
PROJECT_ID=${PROJECT_ID:-$(gcloud config get-value project)}
SERVICE_NAME="audio-generation-service"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
NAMESPACE="content-automation"

# Print configuration
echo "Deploying ${SERVICE_NAME}"
echo "Project ID: ${PROJECT_ID}"
echo "Image: ${IMAGE_NAME}"
echo "Namespace: ${NAMESPACE}"

# Check if required tools are installed
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed. Aborting." >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required but not installed. Aborting." >&2; exit 1; }

# Ensure we're in the correct directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}/.."

# Build the Docker image
echo "Building Docker image..."
docker build -t "${IMAGE_NAME}:latest" .

# Push the image to Google Container Registry
echo "Pushing image to Google Container Registry..."
docker push "${IMAGE_NAME}:latest"

# Create namespace if it doesn't exist
kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || {
    echo "Creating namespace ${NAMESPACE}..."
    kubectl create namespace "${NAMESPACE}"
}

# Create Google Cloud service account key secret if it doesn't exist
if ! kubectl -n "${NAMESPACE}" get secret google-cloud-key >/dev/null 2>&1; then
    echo "Creating Google Cloud service account key secret..."
    
    # Create service account
    SA_NAME="${SERVICE_NAME}-sa"
    SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    gcloud iam service-accounts create "${SA_NAME}" \
        --display-name="${SERVICE_NAME} service account" \
        --project="${PROJECT_ID}"
    
    # Grant necessary permissions
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/storage.objectViewer"
    
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/pubsub.publisher"
    
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/cloudtranslate.user"
    
    # Create and download key
    gcloud iam service-accounts keys create key.json \
        --iam-account="${SA_EMAIL}"
    
    # Create secret
    kubectl create secret generic google-cloud-key \
        --from-file=key.json \
        --namespace="${NAMESPACE}"
    
    # Clean up
    rm key.json
fi

# Apply ConfigMap
echo "Applying ConfigMap..."
envsubst < k8s/configmap.yaml | kubectl apply -f -

# Apply Deployment and Service
echo "Applying Deployment and Service..."
envsubst < k8s/deployment.yaml | kubectl apply -f -

# Wait for deployment to be ready
echo "Waiting for deployment to be ready..."
kubectl rollout status deployment/${SERVICE_NAME} -n "${NAMESPACE}"

# Get service URL
SERVICE_IP=$(kubectl get service ${SERVICE_NAME} -n "${NAMESPACE}" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
if [ -n "${SERVICE_IP}" ]; then
    echo "Service is available at: http://${SERVICE_IP}"
else
    echo "Service is running (ClusterIP)"
fi

# Print deployment status
echo "Deployment complete!"
kubectl get pods -n "${NAMESPACE}" -l app=${SERVICE_NAME}
echo "Use 'kubectl logs -f -l app=${SERVICE_NAME} -n ${NAMESPACE}' to view logs" 