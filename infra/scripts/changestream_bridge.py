#!/usr/bin/env python3
"""
MongoDB Change Streams → Redis Streams Bridge
Watches templates and rules collections, publishes changes to Redis Stream
"""

import os
import sys
import time
import redis
from pymongo import MongoClient
from pymongo.errors import PyMongoError

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://admin:password@localhost:27017/trainingground?authSource=admin")
REDIS_URL = os.getenv("REDIS_URL", "redis://:redispass@localhost:6379")
STREAM_NAME = "content:changes"
MAX_STREAM_LENGTH = 1000

def connect_services():
    """Connect to MongoDB and Redis"""
    try:
        mongo_client = MongoClient(MONGODB_URI)
        mongo_client.admin.command('ping')
        db = mongo_client.trainingground
        print("[INFO] Connected to MongoDB")
        
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        print("[INFO] Connected to Redis")
        
        return db, redis_client
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)

def publish_change_event(redis_client, event_type, document_id, collection, version=None):
    """Publish change event to Redis Stream with idempotency key"""
    idempotency_key = f"{collection}:{document_id}:{event_type}:{version or 'none'}"
    
    event_data = {
        "collection": collection,
        "document_id": str(document_id),
        "action": event_type,
        "version": str(version) if version else "none",
        "timestamp": str(int(time.time() * 1000)),
        "idempotency_key": idempotency_key
    }
    
    try:
        # Add to stream with MAXLEN to prevent unbounded growth
        message_id = redis_client.xadd(
            STREAM_NAME,
            event_data,
            maxlen=MAX_STREAM_LENGTH,
            approximate=True
        )
        print(f"[OK] Published event: {idempotency_key} -> {message_id}")
        return message_id
    except redis.RedisError as e:
        print(f"[ERROR] Failed to publish event: {e}")
        return None

def watch_templates(db, redis_client):
    """Watch templates collection for changes"""
    print("[INFO] Starting Change Stream watcher for templates...")
    
    collection = db.templates
    
    # Watch for insert, update, replace, delete operations
    with collection.watch(full_document='updateLookup') as stream:
        for change in stream:
            operation = change['operationType']
            document_id = change['documentKey']['_id']
            
            print(f"[INFO] Detected {operation} on template {document_id}")
            
            # Extract version from document
            version = None
            if 'fullDocument' in change and change['fullDocument']:
                version = change['fullDocument'].get('version')
            
            # Map operation types
            action_map = {
                'insert': 'created',
                'update': 'updated',
                'replace': 'updated',
                'delete': 'deleted'
            }
            
            action = action_map.get(operation, operation)
            
            # Publish to Redis Stream
            publish_change_event(
                redis_client,
                action,
                document_id,
                'templates',
                version
            )

def watch_rules(db, redis_client):
    """Watch rules collection for changes"""
    print("[INFO] Starting Change Stream watcher for rules...")
    
    collection = db.rules
    
    with collection.watch(full_document='updateLookup') as stream:
        for change in stream:
            operation = change['operationType']
            document_id = change['documentKey']['_id']
            
            print(f"[INFO] Detected {operation} on rule {document_id}")
            
            action_map = {
                'insert': 'created',
                'update': 'updated',
                'replace': 'updated',
                'delete': 'deleted'
            }
            
            action = action_map.get(operation, operation)
            
            publish_change_event(
                redis_client,
                action,
                document_id,
                'rules',
                None
            )

def main():
    """Main loop with error recovery"""
    print("[INFO] Starting Change Streams Bridge...")
    
    db, redis_client = connect_services()
    
    # Check if replica set is enabled (required for Change Streams)
    try:
        status = db.client.admin.command('replSetGetStatus')
        print(f"[INFO] Replica set: {status['set']}")
    except PyMongoError:
        print("[ERROR] Change Streams require MongoDB replica set")
        print("[INFO] For development, run: rs.initiate() in mongo shell")
        sys.exit(1)
    
    # Start watchers in separate threads (simplified version - single-threaded for demo)
    while True:
        try:
            # In production, use threading or asyncio for parallel watching
            watch_templates(db, redis_client)
        except PyMongoError as e:
            print(f"[ERROR] Change Stream error: {e}")
            print("[INFO] Reconnecting in 5 seconds...")
            time.sleep(5)
            db, redis_client = connect_services()
        except KeyboardInterrupt:
            print("\n[INFO] Shutting down...")
            break
        except Exception as e:
            print(f"[ERROR] Unexpected error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
