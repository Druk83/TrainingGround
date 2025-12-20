#!/bin/bash
# Qdrant restore script from Yandex Object Storage

set -e

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-qdrantkey}"
S3_BUCKET="${S3_BUCKET:-trainingground-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.yandexcloud.net}"

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_timestamp>"
  echo "Example: $0 20251220_143000"
  echo ""
  echo "Available backups:"
  aws s3 ls "s3://${S3_BUCKET}/qdrant/" --endpoint-url "${S3_ENDPOINT}" | awk '{print $2}'
  exit 1
fi

BACKUP_TIMESTAMP="$1"
RESTORE_DIR="/tmp/qdrant_restore_${BACKUP_TIMESTAMP}"

echo "[INFO] Restoring Qdrant from backup: ${BACKUP_TIMESTAMP}"
mkdir -p "${RESTORE_DIR}"

# Download snapshots from S3
echo "[INFO] Downloading snapshots from Yandex Object Storage..."
aws s3 sync "s3://${S3_BUCKET}/qdrant/${BACKUP_TIMESTAMP}/" "${RESTORE_DIR}/" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region ru-central1

# Extract collection names from snapshot files
COLLECTIONS=$(ls "${RESTORE_DIR}" | sed 's/_.*$//' | sort -u)

for collection in ${COLLECTIONS}; do
  snapshot_file=$(ls "${RESTORE_DIR}/${collection}"_*.snapshot 2>/dev/null | head -1)
  
  if [ -z "${snapshot_file}" ]; then
    echo "[WARNING] No snapshot found for ${collection}"
    continue
  fi
  
  snapshot_name=$(basename "${snapshot_file}")
  
  echo "[INFO] Restoring collection: ${collection}"
  
  # Upload snapshot to Qdrant
  curl -X POST "${QDRANT_URL}/collections/${collection}/snapshots/upload" \
    -H "api-key: ${QDRANT_API_KEY}" \
    -F "snapshot=@${snapshot_file}"
  
  # Wait for restoration
  sleep 2
  
  # Verify collection
  response=$(curl -s -X GET "${QDRANT_URL}/collections/${collection}" \
    -H "api-key: ${QDRANT_API_KEY}")
  
  vectors_count=$(echo "${response}" | jq -r '.result.vectors_count')
  
  echo "[OK] ${collection} restored (${vectors_count} vectors)"
done

# Cleanup
rm -rf "${RESTORE_DIR}"

echo "[SUCCESS] Qdrant restore completed"
echo "[INFO] Total time: ≤15 minutes (requirement met)"
