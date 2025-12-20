#!/usr/bin/env python3
"""
Qdrant Collections Initialization
Creates collections with proper HNSW parameters and payload schemas
"""

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, HnswConfigDiff, PayloadSchemaType, PayloadIndexInfo

# Configuration
QDRANT_URL = "http://localhost:6333"
QDRANT_API_KEY = "qdrantkey"
VECTOR_DIM = 768  # sentence-transformers/paraphrase-multilingual-mpnet-base-v2

def create_collections():
    """Initialize all Qdrant collections"""
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)
    
    print("[INFO] Creating Qdrant collections...")
    
    # 1. Rules embeddings
    client.recreate_collection(
        collection_name="rules_embeddings",
        vectors_config=VectorParams(
            size=VECTOR_DIM,
            distance=Distance.COSINE,
            hnsw_config=HnswConfigDiff(
                m=16,  # Number of edges per node
                ef_construct=200,  # Quality of index construction
                full_scan_threshold=10000
            )
        )
    )
    
    # Payload schema for rules
    client.create_payload_index(
        collection_name="rules_embeddings",
        field_name="rule_id",
        field_schema=PayloadSchemaType.KEYWORD
    )
    client.create_payload_index(
        collection_name="rules_embeddings",
        field_name="slug",
        field_schema=PayloadSchemaType.KEYWORD
    )
    client.create_payload_index(
        collection_name="rules_embeddings",
        field_name="difficulty",
        field_schema=PayloadSchemaType.KEYWORD
    )
    
    print("[OK] rules_embeddings created")
    
    # 2. Examples embeddings
    client.recreate_collection(
        collection_name="examples_embeddings",
        vectors_config=VectorParams(
            size=VECTOR_DIM,
            distance=Distance.COSINE,
            hnsw_config=HnswConfigDiff(
                m=16,
                ef_construct=200,
                full_scan_threshold=10000
            )
        )
    )
    
    client.create_payload_index(
        collection_name="examples_embeddings",
        field_name="rule_id",
        field_schema=PayloadSchemaType.KEYWORD
    )
    client.create_payload_index(
        collection_name="examples_embeddings",
        field_name="type",
        field_schema=PayloadSchemaType.KEYWORD
    )
    
    print("[OK] examples_embeddings created")
    
    # 3. Templates embeddings
    client.recreate_collection(
        collection_name="templates_embeddings",
        vectors_config=VectorParams(
            size=VECTOR_DIM,
            distance=Distance.COSINE,
            hnsw_config=HnswConfigDiff(
                m=16,
                ef_construct=200,
                full_scan_threshold=10000
            )
        )
    )
    
    client.create_payload_index(
        collection_name="templates_embeddings",
        field_name="template_id",
        field_schema=PayloadSchemaType.KEYWORD
    )
    client.create_payload_index(
        collection_name="templates_embeddings",
        field_name="level_id",
        field_schema=PayloadSchemaType.KEYWORD
    )
    client.create_payload_index(
        collection_name="templates_embeddings",
        field_name="active",
        field_schema=PayloadSchemaType.BOOL
    )
    
    print("[OK] templates_embeddings created")
    
    print("[SUCCESS] All collections initialized")

if __name__ == "__main__":
    create_collections()
