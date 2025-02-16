import json
import os
import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta

import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from sklearn.feature_extraction.text import TfidfVectorizer
from dotenv import load_dotenv
from google.cloud import pubsub_v1, language_v1, videointelligence_v1
from google.cloud import logging as cloud_logging
from google.cloud.language_v1 import Entity
import googleapiclient.discovery
from googleapiclient.discovery import build
import asyncio
from pytrends.request import TrendReq

# Initialize FastAPI app
app = FastAPI(title="Topic Discovery Service")

# Load environment variables
load_dotenv()

# Setup logging
logger = logging.getLogger("topic-discovery-service")
if cloud_logging:
    logging_client = cloud_logging.Client()
    logger = logging_client.logger("topic-discovery-service")

# Download required NLTK data
nltk.download('punkt')
nltk.download('stopwords')
nltk.download('averaged_perceptron_tagger')

class TopicDiscoveryService:
    def __init__(self):
        self.config = self._load_config()
        self.publisher = pubsub_v1.PublisherClient()
        self.language_client = language_v1.LanguageServiceClient()
        self.video_client = videointelligence_v1.VideoIntelligenceServiceClient()
        
        # Initialize Google API clients
        self.youtube = build('youtube', 'v3', 
                           developerKey=os.getenv('GOOGLE_API_KEY'))
        
        # Initialize Pytrends
        self.pytrends = TrendReq(hl='en-US', tz=360)
        
        self.vectorizer = TfidfVectorizer(
            min_df=self.config['nlp']['min_document_frequency'],
            max_df=self.config['nlp']['max_document_frequency'],
            stop_words=self.config['nlp']['stop_words']
        )

    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        config_path = os.path.join(
            os.path.dirname(__file__),
            'config/topic-discovery-config.json'
        )
        with open(config_path, 'r') as f:
            return json.load(f)

    async def process_raw_data(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Process incoming raw data to identify topics."""
        try:
            # Extract text content from the data
            texts = self._extract_text_content(data)
            
            # Perform text preprocessing
            processed_texts = self._preprocess_texts(texts)
            
            # Extract topics using TF-IDF
            topics = self._extract_topics(processed_texts)
            
            # Score and filter topics
            scored_topics = self._score_topics(topics, data)
            
            return scored_topics
        except Exception as e:
            logger.error(f"Error processing raw data: {str(e)}")
            raise

    def _extract_text_content(self, data: Dict[str, Any]) -> List[str]:
        """Extract text content from various data sources."""
        texts = []
        
        if 'social_media' in data:
            for post in data['social_media']:
                if post.get('text'):
                    texts.append(post['text'])
        
        if 'search_queries' in data:
            texts.extend(data['search_queries'])
        
        return texts

    def _preprocess_texts(self, texts: List[str]) -> List[str]:
        """Preprocess text data."""
        processed_texts = []
        stop_words = set(stopwords.words('english'))
        
        for text in texts:
            # Tokenize
            tokens = word_tokenize(text.lower())
            
            # Filter tokens
            filtered_tokens = [
                token for token in tokens
                if (len(token) >= self.config['nlp']['min_token_length'] and
                    len(token) <= self.config['nlp']['max_token_length'] and
                    token not in stop_words)
            ]
            
            processed_texts.append(' '.join(filtered_tokens))
        
        return processed_texts

    def _extract_topics(self, texts: List[str]) -> List[Dict[str, Any]]:
        """Extract topics using TF-IDF."""
        if not texts:
            return []

        # Generate TF-IDF matrix
        tfidf_matrix = self.vectorizer.fit_transform(texts)
        feature_names = self.vectorizer.get_feature_names_out()
        
        # Extract top terms as topics
        topics = []
        for idx, score in enumerate(tfidf_matrix.sum(axis=0).A1):
            if score > 0:
                topics.append({
                    'term': feature_names[idx],
                    'score': float(score),
                    'timestamp': datetime.utcnow().isoformat()
                })
        
        return sorted(topics, key=lambda x: x['score'], reverse=True)

    def _score_topics(self, topics: List[Dict[str, Any]], data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Score and filter topics based on configuration criteria."""
        scored_topics = []
        
        for topic in topics:
            if topic['score'] >= self.config['analysis']['min_trend_score']:
                # Enrich topic with additional metadata
                topic['metadata'] = {
                    'source': data.get('source', 'unknown'),
                    'region': data.get('region', 'global'),
                    'category': self._determine_category(topic['term'])
                }
                scored_topics.append(topic)
                
                if len(scored_topics) >= self.config['analysis']['max_topics_per_batch']:
                    break
        
        return scored_topics

    def _determine_category(self, term: str) -> str:
        """Determine the category of a topic term using NLP."""
        # Basic category determination based on POS tagging
        pos_tag = nltk.pos_tag([term])[0][1]
        
        if pos_tag.startswith('NN'):
            return 'entity'
        elif pos_tag.startswith('VB'):
            return 'action'
        elif pos_tag.startswith('JJ'):
            return 'attribute'
        else:
            return 'other'

    async def publish_topics(self, topics: List[Dict[str, Any]]) -> None:
        """Publish discovered topics to Pub/Sub."""
        if not self.publisher:
            logger.warning("Pub/Sub publisher not initialized, skipping publish")
            return

        try:
            topic_path = self.config['pubsub']['output_topic']
            
            for topic in topics:
                data = json.dumps(topic).encode('utf-8')
                future = self.publisher.publish(topic_path, data)
                future.result()  # Wait for publishing to complete
                
            logger.info(f"Successfully published {len(topics)} topics")
        except Exception as e:
            logger.error(f"Error publishing topics: {str(e)}")
            raise

    async def discover_trends(self) -> List[Dict[str, Any]]:
        """Discover trends from multiple Google sources."""
        try:
            # Gather trends from different sources concurrently
            tasks = [
                self._get_google_trends(),
                self._get_youtube_trends(),
                self._get_news_trends(),
                self._analyze_search_trends()
            ]
            
            results = await asyncio.gather(*tasks)
            
            # Combine and process all trends
            all_trends = []
            for source_trends in results:
                all_trends.extend(source_trends)
            
            # Score and filter the combined trends
            scored_trends = self._score_topics(all_trends, {'source': 'google'})
            
            # Add trend categories using Natural Language API
            enriched_trends = await self._enrich_trends_with_categories(scored_trends)
            
            return enriched_trends
        except Exception as e:
            logger.error(f"Error discovering trends: {str(e)}")
            raise

    async def _get_google_trends(self) -> List[Dict[str, Any]]:
        """Get trending topics from Google Trends using Pytrends."""
        try:
            trends = []
            region = self.config['data_sources']['google_trends']['region']
            
            # Get real-time trending searches
            trending_searches = self.pytrends.trending_searches(pn=region)
            
            # Get daily trending searches
            daily_trends = self.pytrends.today_searches(pn=region)
            
            # Process trending searches
            for index, term in enumerate(trending_searches):
                # Get more details about this trend
                self.pytrends.build_payload([term], timeframe='now 1-d', geo=region)
                
                # Get related queries
                related_queries = self.pytrends.related_queries()
                top_queries = related_queries.get(term, {}).get('top', pd.DataFrame())
                
                # Get interest by region
                interest_by_region = self.pytrends.interest_by_region(resolution='COUNTRY')
                
                trends.append({
                    'term': term,
                    'score': 1.0 - (index / len(trending_searches)),  # Normalize score based on position
                    'timestamp': datetime.utcnow().isoformat(),
                    'metadata': {
                        'source': 'google_trends',
                        'region': region,
                        'rank': index + 1,
                        'related_queries': top_queries.to_dict() if not top_queries.empty else {},
                        'regional_interest': interest_by_region.to_dict() if not interest_by_region.empty else {},
                        'type': 'trending_search'
                    }
                })
            
            # Process daily trends
            for index, term in enumerate(daily_trends):
                if term not in [t['term'] for t in trends]:  # Avoid duplicates
                    trends.append({
                        'term': term,
                        'score': 0.5 - (index / len(daily_trends)),  # Lower score for daily trends
                        'timestamp': datetime.utcnow().isoformat(),
                        'metadata': {
                            'source': 'google_trends',
                            'region': region,
                            'rank': index + 1,
                            'type': 'daily_trend'
                        }
                    })
            
            # Get interest over time for top trends
            if trends:
                top_terms = [t['term'] for t in trends[:5]]  # Get top 5 trends
                self.pytrends.build_payload(
                    top_terms,
                    timeframe='now 7-d',
                    geo=region
                )
                
                interest_over_time = self.pytrends.interest_over_time()
                
                # Update trends with interest over time data
                for trend in trends:
                    if trend['term'] in interest_over_time.columns:
                        trend['metadata']['interest_over_time'] = interest_over_time[trend['term']].to_dict()
            
            return trends
        except Exception as e:
            logger.error(f"Error fetching Google Trends: {str(e)}")
            return []

    async def _get_youtube_trends(self) -> List[Dict[str, Any]]:
        """Get trending topics from YouTube."""
        try:
            trends = []
            region = self.config['data_sources']['google_trends']['region']
            
            # Get trending videos
            request = self.youtube.videos().list(
                part='snippet,statistics',
                chart='mostPopular',
                regionCode=region,
                maxResults=50
            )
            response = request.execute()
            
            for video in response.get('items', []):
                trends.append({
                    'term': video['snippet']['title'],
                    'score': float(video['statistics'].get('viewCount', 0)) / 1000000,
                    'timestamp': datetime.utcnow().isoformat(),
                    'metadata': {
                        'source': 'youtube',
                        'region': region,
                        'category': video['snippet'].get('categoryId'),
                        'tags': video['snippet'].get('tags', []),
                        'views': video['statistics'].get('viewCount'),
                        'likes': video['statistics'].get('likeCount')
                    }
                })
            
            return trends
        except Exception as e:
            logger.error(f"Error fetching YouTube trends: {str(e)}")
            return []

    async def _get_news_trends(self) -> List[Dict[str, Any]]:
        """Analyze trending topics from news articles."""
        try:
            trends = []
            
            # Analyze entities in news content
            document = language_v1.Document(
                content=self._get_news_content(),
                type_=language_v1.Document.Type.PLAIN_TEXT,
            )
            
            response = self.language_client.analyze_entities(
                document=document,
                encoding_type=language_v1.EncodingType.UTF8
            )
            
            for entity in response.entities:
                if entity.salience > 0.1:  # Filter for significant entities
                    trends.append({
                        'term': entity.name,
                        'score': float(entity.salience),
                        'timestamp': datetime.utcnow().isoformat(),
                        'metadata': {
                            'source': 'news',
                            'type': entity.type_.name,
                            'mentions': len(entity.mentions),
                            'sentiment': entity.sentiment.score if entity.sentiment else 0
                        }
                    })
            
            return trends
        except Exception as e:
            logger.error(f"Error analyzing news trends: {str(e)}")
            return []

    async def _analyze_search_trends(self) -> List[Dict[str, Any]]:
        """Analyze search trends using Natural Language API."""
        try:
            trends = []
            search_data = self._get_search_data()
            
            # Analyze text with Natural Language API
            document = language_v1.Document(
                content=search_data,
                type_=language_v1.Document.Type.PLAIN_TEXT,
            )
            
            response = self.language_client.analyze_entities(
                document=document,
                encoding_type=language_v1.EncodingType.UTF8
            )
            
            for entity in response.entities:
                trends.append({
                    'term': entity.name,
                    'score': float(entity.salience),
                    'timestamp': datetime.utcnow().isoformat(),
                    'metadata': {
                        'source': 'search',
                        'type': entity.type_.name,
                        'mentions': len(entity.mentions)
                    }
                })
            
            return trends
        except Exception as e:
            logger.error(f"Error analyzing search trends: {str(e)}")
            return []

    def _get_news_content(self) -> str:
        """Get recent news content for analysis."""
        # Implement news content fetching logic
        # This would typically involve calling a news API or scraping news sites
        return ""

    def _get_search_data(self) -> str:
        """Get recent search data for analysis."""
        # Implement search data fetching logic
        # This would typically involve getting data from Search Console API
        return ""

    async def _enrich_trends_with_categories(self, trends: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich trends with categories using Natural Language API."""
        try:
            for trend in trends:
                # Create a document for analysis
                document = language_v1.Document(
                    content=trend['term'],
                    type_=language_v1.Document.Type.PLAIN_TEXT,
                )
                
                # Analyze entities
                response = self.language_client.analyze_entities(
                    document=document,
                    encoding_type=language_v1.EncodingType.UTF8
                )
                
                # Extract categories from entities
                if response.entities:
                    main_entity = response.entities[0]
                    trend['metadata']['category'] = main_entity.type_.name
                    trend['metadata']['salience'] = main_entity.salience
                    if main_entity.metadata:
                        trend['metadata']['entity_metadata'] = dict(main_entity.metadata)
                
            return trends
        except Exception as e:
            logger.error(f"Error enriching trends with categories: {str(e)}")
            return trends  # Return original trends if enrichment fails

# Initialize the service
topic_discovery_service = TopicDiscoveryService()

class RawData(BaseModel):
    """Pydantic model for raw data input."""
    source: str
    content: Dict[str, Any]
    timestamp: datetime

@app.post("/process")
async def process_data(data: RawData):
    """API endpoint to process raw data and discover topics."""
    try:
        # Process the raw data
        discovered_topics = await topic_discovery_service.process_raw_data(data.content)
        
        # Publish the discovered topics
        await topic_discovery_service.publish_topics(discovered_topics)
        
        return {
            "status": "success",
            "topics_discovered": len(discovered_topics),
            "topics": discovered_topics
        }
    except Exception as e:
        logger.error(f"Error in process_data endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/trends")
async def get_trends(background_tasks: BackgroundTasks):
    """API endpoint to get current trends."""
    try:
        # Discover trends
        discovered_trends = await topic_discovery_service.discover_trends()
        
        # Publish trends in the background
        background_tasks.add_task(
            topic_discovery_service.publish_topics,
            discovered_trends
        )
        
        return {
            "status": "success",
            "trends_discovered": len(discovered_trends),
            "trends": discovered_trends
        }
    except Exception as e:
        logger.error(f"Error in get_trends endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 