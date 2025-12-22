#!/bin/bash
# Qdrant snapshot script with Yandex Object Storage integration

set -e

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
if [ -z "${QDRANT_API_KEY}" ]; then
  echo "ERROR: QDRANT_API_KEY must be set"
  exit 1
fi
S3_BUCKET="${S3_BUCKET:-trainingground-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.yandexcloud.net}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"

COLLECTIONS=("rules_embeddings" "examples_embeddings" "templates_embeddings")
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/qdrant_snapshots_${TIMESTAMP}"

echo "[INFO] Starting Qdrant snapshot backup..."
mkdir -p "${BACKUP_DIR}"

# Create snapshots for each collection
for collection in "${COLLECTIONS[@]}"; do
  echo "[INFO] Creating snapshot for ${collection}..."
  
  # Trigger snapshot creation via API
  response=$(curl -s -X POST "${QDRANT_URL}/collections/${collection}/snapshots" \
    -H "api-key: ${QDRANT_API_KEY}")
  
  snapshot_name=$(echo "${response}" | jq -r '.result.name')
  
  if [ -z "${snapshot_name}" ] || [ "${snapshot_name}" == "null" ]; then
    echo "[ERROR] Failed to create snapshot for ${collection}"
    exit 1
  fi
  
  echo "[INFO] Snapshot created: ${snapshot_name}"
  
  # Download snapshot
  curl -s -X GET "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    -H "api-key: ${QDRANT_API_KEY}" \
    -o "${BACKUP_DIR}/${collection}_${snapshot_name}"
  
  echo "[OK] Downloaded ${collection} snapshot"
done

# Upload to Yandex Object Storage (S3-compatible)
echo "[INFO] Uploading snapshots to Yandex Object Storage..."

aws s3 sync "${BACKUP_DIR}" "s3://${S3_BUCKET}/qdrant/${TIMESTAMP}/" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region ru-central1

# Cleanup local snapshots
rm -rf "${BACKUP_DIR}"

# Keep only last 7 days of backups
echo "[INFO] Cleaning old backups (keeping last 7 days)..."
CUTOFF_DATE=$(date -d '7 days ago' +%Y%m%d)

aws s3 ls "s3://${S3_BUCKET}/qdrant/" --endpoint-url "${S3_ENDPOINT}" \
  | awk '{print $2}' | while read -r folder; do
    folder_date=$(echo "${folder}" | sed 's/_.*//; s/\///')
    if [ "${folder_date}" -lt "${CUTOFF_DATE}" ]; then
      echo "[INFO] Deleting old backup: ${folder}"
      aws s3 rm "s3://${S3_BUCKET}/qdrant/${folder}" --recursive \
        --endpoint-url "${S3_ENDPOINT}"
    fi
  done

echo "[SUCCESS] Qdrant backup completed: ${TIMESTAMP}"
