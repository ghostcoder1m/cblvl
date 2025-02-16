import json
import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.cloud import pubsub_v1, bigquery, aiplatform
from google.cloud import logging as cloud_logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv

# Initialize FastAPI app
app = FastAPI(title="Topic Prioritization Service")

# Load environment variables
load_dotenv()

# Setup logging
logger = logging.getLogger("topic-prioritization-service")
if cloud_logging:
    logging_client = cloud_logging.Client()
    logger = logging_client.logger("topic-prioritization-service")

class TopicData(BaseModel):
    """Pydantic model for topic data."""
    term: str
    score: float
    metadata: Dict[str, Any]
    timestamp: datetime

class TopicPrioritizationService:
    def __init__(self):
        self.config = self._load_config()
        self.publisher = pubsub_v1.PublisherClient()
        self.subscriber = pubsub_v1.SubscriberClient()
        self.bigquery_client = bigquery.Client()
        self.model_endpoint = None
        self._initialize_vertex_ai()
        self._setup_scheduler()

    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            '../config/topic-prioritization-config.json'
        )
        with open(config_path, 'r') as f:
            return json.load(f)

    def _initialize_vertex_ai(self):
        """Initialize Vertex AI endpoint."""
        try:
            aiplatform.init(
                project=os.getenv('GOOGLE_CLOUD_PROJECT'),
                location=self.config['model']['vertex_ai']['region']
            )
            self.model_endpoint = aiplatform.Endpoint(
                self.config['model']['vertex_ai']['endpoint_name']
            )
            logger.info("Successfully initialized Vertex AI endpoint")
        except Exception as e:
            logger.error(f"Error initializing Vertex AI: {str(e)}")
            self.model_endpoint = None

    def _setup_scheduler(self):
        """Set up scheduled tasks."""
        self.scheduler = AsyncIOScheduler()
        
        # Schedule model retraining
        self.scheduler.add_job(
            self.train_model,
            'cron',
            day_of_week='sun',
            hour=0,
            minute=0
        )
        
        self.scheduler.start()

    async def process_topic(self, topic: TopicData) -> Dict[str, Any]:
        """Process and prioritize a single topic."""
        try:
            # Get additional data from BigQuery
            enriched_data = await self._enrich_topic_data(topic)
            
            # Score the topic using the model
            priority_score = await self._score_topic(enriched_data)
            
            # Create prioritized topic
            prioritized_topic = {
                'term': topic.term,
                'original_score': topic.score,
                'priority_score': float(priority_score),
                'metadata': {
                    **topic.metadata,
                    'priority_factors': enriched_data,
                    'prioritized_at': datetime.utcnow().isoformat()
                }
            }
            
            # Publish if score meets threshold
            if priority_score >= self.config['scoring']['thresholds']['min_priority_score']:
                await self.publish_topic(prioritized_topic)
            
            return prioritized_topic
        except Exception as e:
            logger.error(f"Error processing topic: {str(e)}")
            raise

    async def _enrich_topic_data(self, topic: TopicData) -> Dict[str, float]:
        """Enrich topic data with BigQuery data."""
        query = f"""
        SELECT
            COALESCE(s.search_volume, 0) as search_volume,
            COALESCE(s.competition, 0) as competition,
            COALESCE(AVG(f.score), 0) as hitl_score
        FROM `{self.config['data_sources']['bigquery']['dataset']}.{self.config['data_sources']['bigquery']['tables']['search_data']}` s
        LEFT JOIN `{self.config['data_sources']['bigquery']['dataset']}.{self.config['data_sources']['bigquery']['tables']['feedback']}` f
        ON s.term = f.term
        WHERE s.term = @term
        GROUP BY s.search_volume, s.competition
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("term", "STRING", topic.term)
            ]
        )
        
        try:
            results = self.bigquery_client.query(query, job_config=job_config).result()
            row = next(results, None)
            
            if row:
                return {
                    'search_volume': float(row.search_volume),
                    'competition': float(row.competition),
                    'trend_score': float(topic.score),
                    'hitl_score': float(row.hitl_score)
                }
            else:
                return {
                    'search_volume': 0.0,
                    'competition': 0.0,
                    'trend_score': float(topic.score),
                    'hitl_score': 0.0
                }
        except Exception as e:
            logger.error(f"Error querying BigQuery: {str(e)}")
            raise

    async def _score_topic(self, topic_data: Dict[str, float]) -> float:
        """Score topic using the Vertex AI model or fallback scoring."""
        if self.model_endpoint:
            try:
                # Prepare features for the model
                features = np.array([[
                    topic_data['search_volume'],
                    topic_data['competition'],
                    topic_data['trend_score'],
                    topic_data['hitl_score']
                ]])
                
                # Get prediction from model
                prediction = self.model_endpoint.predict(features)
                return float(prediction[0])
            except Exception as e:
                logger.error(f"Error using Vertex AI model: {str(e)}")
                # Fall back to weighted scoring
        
        # Fallback: weighted scoring
        weights = self.config['scoring']['weights']
        score = sum(
            topic_data[key] * weight
            for key, weight in weights.items()
        )
        return min(max(score, 0.0), 1.0)

    async def publish_topic(self, topic: Dict[str, Any]) -> None:
        """Publish prioritized topic to Pub/Sub."""
        try:
            topic_path = self.config['pubsub']['output_topic']
            data = json.dumps(topic).encode('utf-8')
            future = self.publisher.publish(topic_path, data)
            future.result()
            logger.info(f"Successfully published prioritized topic: {topic['term']}")
        except Exception as e:
            logger.error(f"Error publishing topic: {str(e)}")
            raise

    async def train_model(self) -> None:
        """Train and deploy a new model using historical data."""
        try:
            # Get training data from BigQuery
            query = f"""
            SELECT
                s.search_volume,
                s.competition,
                t.score as trend_score,
                COALESCE(AVG(f.score), 0) as hitl_score,
                h.success_rate as label
            FROM `{self.config['data_sources']['bigquery']['dataset']}.{self.config['data_sources']['bigquery']['tables']['historical']}` h
            JOIN `{self.config['data_sources']['bigquery']['dataset']}.{self.config['data_sources']['bigquery']['tables']['search_data']}` s
            ON h.term = s.term
            JOIN `{self.config['data_sources']['bigquery']['dataset']}.{self.config['data_sources']['bigquery']['tables']['feedback']}` f
            ON h.term = f.term
            GROUP BY s.search_volume, s.competition, t.score, h.success_rate
            """
            
            df = self.bigquery_client.query(query).to_dataframe()
            
            if len(df) < 100:  # Minimum required samples
                logger.warning("Insufficient training data")
                return
            
            # Prepare training data
            X = df[['search_volume', 'competition', 'trend_score', 'hitl_score']].values
            y = df['label'].values
            
            # Create and train model using Vertex AI
            training_job = aiplatform.CustomTrainingJob(
                display_name=self.config['model']['vertex_ai']['model_name'],
                script_path="train.py",
                container_uri="us-docker.pkg.dev/vertex-ai/training/tf-cpu.2-12:latest",
                requirements=["tensorflow==2.12.0", "scikit-learn==1.3.2"]
            )
            
            model = training_job.run(
                dataset=X,
                labels=y,
                training_args={
                    "epochs": self.config['model']['vertex_ai']['training']['epochs'],
                    "batch_size": self.config['model']['vertex_ai']['training']['batch_size'],
                    "learning_rate": self.config['model']['vertex_ai']['training']['learning_rate']
                }
            )
            
            # Deploy model to endpoint
            endpoint = model.deploy(
                machine_type="n1-standard-2",
                min_replica_count=1,
                max_replica_count=2
            )
            
            # Update service to use new endpoint
            self.model_endpoint = endpoint
            logger.info("Successfully trained and deployed new model")
            
        except Exception as e:
            logger.error(f"Error training model: {str(e)}")
            raise

# Initialize service
prioritization_service = TopicPrioritizationService()

@app.post("/prioritize")
async def prioritize_topic(topic: TopicData):
    """API endpoint to prioritize a topic."""
    try:
        prioritized_topic = await prioritization_service.process_topic(topic)
        return {
            "status": "success",
            "topic": prioritized_topic
        }
    except Exception as e:
        logger.error(f"Error in prioritize_topic endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train")
async def trigger_training():
    """API endpoint to trigger model training."""
    try:
        await prioritization_service.train_model()
        return {"status": "success", "message": "Model training completed"}
    except Exception as e:
        logger.error(f"Error in trigger_training endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 