#!/bin/bash
# Unified restore script for MongoDB, Redis, Qdrant

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_timestamp>"
  echo "Example: $0 20251220_143000"
  echo ""
  echo "Available backups:"
  aws s3 ls "s3://${S3_BUCKET}/full_backup/" --endpoint-url "${S3_ENDPOINT}" | awk '{print $2}'
  exit 1
fi

BACKUP_TIMESTAMP="$1"
RESTORE_DIR="/tmp/restore_${BACKUP_TIMESTAMP}"
S3_BUCKET="${S3_BUCKET:-trainingground-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.yandexcloud.net}"

# MongoDB
MONGODB_URI="${MONGODB_URI:-mongodb://admin:password@localhost:27017/trainingground?authSource=admin}"

# Redis
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redispass}"

# Qdrant
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-qdrantkey}"

echo "================================"
echo "TrainingGround Restore: ${BACKUP_TIMESTAMP}"
echo "================================"
echo "[WARNING] This will overwrite existing data!"
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Restore cancelled"
  exit 0
fi

mkdir -p "${RESTORE_DIR}"

# === DOWNLOAD FROM S3 ===
echo "[INFO] Downloading backup from Yandex Object Storage..."
aws s3 sync "s3://${S3_BUCKET}/full_backup/${BACKUP_TIMESTAMP}/" "${RESTORE_DIR}/" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region ru-central1

# === MONGODB RESTORE ===
echo "[1/3] Restoring MongoDB..."

tar -xzf "${RESTORE_DIR}/mongodb.tar.gz" -C "${RESTORE_DIR}"

mongorestore --uri="${MONGODB_URI}" \
  --drop \
  --gzip \
  "${RESTORE_DIR}/mongodb/${MONGO_DB}"

echo "[OK] MongoDB restored"

# === REDIS RESTORE ===
echo "[2/3] Restoring Redis..."

# Stop Redis (Docker)
echo "[INFO] Stopping Redis..."
docker-compose stop redis

# Replace RDB file
REDIS_CONTAINER=$(docker-compose ps -q redis)
gunzip -c "${RESTORE_DIR}/redis/dump.rdb.gz" > /tmp/dump.rdb
docker cp /tmp/dump.rdb "${REDIS_CONTAINER}:/data/dump.rdb"
rm /tmp/dump.rdb

# Start Redis
echo "[INFO] Starting Redis..."
docker-compose start redis

# Wait for Redis to be ready
sleep 3
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning PING

echo "[OK] Redis restored"

# === QDRANT RESTORE ===
echo "[3/3] Restoring Qdrant..."

COLLECTIONS=$(ls "${RESTORE_DIR}/qdrant" | sed 's/_.*$//' | sort -u)

for collection in ${COLLECTIONS}; do
  snapshot_file=$(ls "${RESTORE_DIR}/qdrant/${collection}"_*.snapshot 2>/dev/null | head -1)
  
  if [ -z "${snapshot_file}" ]; then
    echo "[WARNING] No snapshot found for ${collection}"
    continue
  fi
  
  echo "[INFO] Restoring ${collection}..."
  
  curl -X POST "${QDRANT_URL}/collections/${collection}/snapshots/upload" \
    -H "api-key: ${QDRANT_API_KEY}" \
    -F "snapshot=@${snapshot_file}"
  
  sleep 2
done

echo "[OK] Qdrant restored"

# Cleanup
rm -rf "${RESTORE_DIR}"

echo "================================"
echo "[SUCCESS] Restore completed"
echo "Restore time: $(date +%H:%M:%S)"
echo "================================"
