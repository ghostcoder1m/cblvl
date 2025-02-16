from typing import Dict, Set, Any
from fastapi import WebSocket
import json
import logging
from logging_config import get_logger

logger = get_logger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts for interactive content."""
    
    def __init__(self):
        """Initialize the WebSocket manager."""
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
        logger.info("WebSocket manager initialized")

    async def connect(self, websocket: WebSocket, content_id: str) -> None:
        """
        Connect a WebSocket client for a specific content ID.
        
        Args:
            websocket: The WebSocket connection
            content_id: The ID of the content being interacted with
        """
        try:
            # Accept the connection
            await websocket.accept()
            
            # Initialize content_id set if it doesn't exist
            if content_id not in self.active_connections:
                self.active_connections[content_id] = set()
            
            # Add the connection to the set
            self.active_connections[content_id].add(websocket)
            
            # Store metadata about the connection
            self.connection_metadata[websocket] = {
                "content_id": content_id,
                "connected_at": datetime.utcnow().isoformat(),
                "client_info": websocket.client.host
            }
            
            logger.info(f"New WebSocket connection for content {content_id}")
            
            # Send connection confirmation
            await websocket.send_json({
                "type": "connection_established",
                "content_id": content_id,
                "message": "Successfully connected to interactive content"
            })
            
        except Exception as e:
            logger.error(f"Error establishing WebSocket connection: {str(e)}")
            raise

    async def disconnect(self, websocket: WebSocket, content_id: str) -> None:
        """
        Disconnect a WebSocket client.
        
        Args:
            websocket: The WebSocket connection to disconnect
            content_id: The ID of the content the client was interacting with
        """
        try:
            # Remove the connection from the set
            if content_id in self.active_connections:
                self.active_connections[content_id].remove(websocket)
                
                # If no more connections for this content, clean up
                if not self.active_connections[content_id]:
                    del self.active_connections[content_id]
            
            # Clean up metadata
            if websocket in self.connection_metadata:
                del self.connection_metadata[websocket]
                
            logger.info(f"WebSocket connection closed for content {content_id}")
            
        except Exception as e:
            logger.error(f"Error during WebSocket disconnection: {str(e)}")

    async def broadcast(self, content_id: str, message: Dict[str, Any]) -> None:
        """
        Broadcast a message to all connected clients for a specific content ID.
        
        Args:
            content_id: The ID of the content to broadcast to
            message: The message to broadcast
        """
        if content_id not in self.active_connections:
            logger.warning(f"No active connections for content {content_id}")
            return
            
        disconnected = set()
        
        # Add timestamp to message
        message["timestamp"] = datetime.utcnow().isoformat()
        
        # Broadcast to all connected clients
        for connection in self.active_connections[content_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting message: {str(e)}")
                disconnected.add(connection)
        
        # Clean up any disconnected clients
        for connection in disconnected:
            await self.disconnect(connection, content_id)

    async def send_personal_message(
        self,
        websocket: WebSocket,
        message: Dict[str, Any]
    ) -> None:
        """
        Send a message to a specific client.
        
        Args:
            websocket: The WebSocket connection to send to
            message: The message to send
        """
        try:
            # Add timestamp to message
            message["timestamp"] = datetime.utcnow().isoformat()
            await websocket.send_json(message)
            
        except Exception as e:
            logger.error(f"Error sending personal message: {str(e)}")
            # If sending fails, assume connection is dead
            content_id = self.connection_metadata.get(websocket, {}).get("content_id")
            if content_id:
                await self.disconnect(websocket, content_id)

    async def get_connection_info(self, content_id: str) -> Dict[str, Any]:
        """
        Get information about active connections for a content ID.
        
        Args:
            content_id: The ID of the content to get information for
            
        Returns:
            Dict containing connection information
        """
        if content_id not in self.active_connections:
            return {
                "content_id": content_id,
                "active_connections": 0,
                "clients": []
            }
            
        connections = self.active_connections[content_id]
        return {
            "content_id": content_id,
            "active_connections": len(connections),
            "clients": [
                {
                    "client_host": self.connection_metadata[conn]["client_info"],
                    "connected_at": self.connection_metadata[conn]["connected_at"]
                }
                for conn in connections
            ]
        }

    def get_total_connections(self) -> int:
        """
        Get the total number of active WebSocket connections.
        
        Returns:
            Total number of active connections across all content IDs
        """
        return sum(len(connections) for connections in self.active_connections.values()) 