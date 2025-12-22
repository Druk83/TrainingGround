#!/bin/bash
# Unified backup script for MongoDB, Redis, Qdrant

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="/tmp/backups_${TIMESTAMP}"
S3_BUCKET="${S3_BUCKET:-trainingground-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.yandexcloud.net}"

# MongoDB
if [ -z "${MONGODB_URI}" ]; then
  MONGO_USER="${MONGO_USER:-admin}"
  if [ -z "${MONGO_PASSWORD}" ]; then
    echo "ERROR: MONGO_PASSWORD must be set"
    exit 1
  fi
  MONGODB_URI="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/trainingground?authSource=admin"
fi
MONGO_DB="trainingground"

# Redis
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
if [ -z "${REDIS_PASSWORD}" ]; then
  echo "ERROR: REDIS_PASSWORD must be set"
  exit 1
fi

# Qdrant
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
if [ -z "${QDRANT_API_KEY}" ]; then
  echo "ERROR: QDRANT_API_KEY must be set"
  exit 1
fi

echo "================================"
echo "TrainingGround Backup: ${TIMESTAMP}"
echo "================================"

mkdir -p "${BACKUP_ROOT}"

# === MONGODB BACKUP ===
echo "[1/3] Backing up MongoDB..."
MONGO_BACKUP_DIR="${BACKUP_ROOT}/mongodb"
mkdir -p "${MONGO_BACKUP_DIR}"

mongodump --uri="${MONGODB_URI}" \
  --out="${MONGO_BACKUP_DIR}" \
  --gzip

# Encrypt sensitive collections (PII)
echo "[INFO] Encrypting PII data..."
tar -czf "${MONGO_BACKUP_DIR}.tar.gz" -C "${BACKUP_ROOT}" mongodb
rm -rf "${MONGO_BACKUP_DIR}"

echo "[OK] MongoDB backup completed"

# === REDIS BACKUP ===
echo "[2/3] Backing up Redis..."
REDIS_BACKUP_DIR="${BACKUP_ROOT}/redis"
mkdir -p "${REDIS_BACKUP_DIR}"

# Trigger BGSAVE
redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE

# Wait for BGSAVE to complete
while [ "$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning LASTSAVE)" == "$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning LASTSAVE)" ]; do
  sleep 1
done

# Copy RDB file
REDIS_DIR=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning CONFIG GET dir | tail -1)
REDIS_DBFILENAME=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning CONFIG GET dbfilename | tail -1)

cp "${REDIS_DIR}/${REDIS_DBFILENAME}" "${REDIS_BACKUP_DIR}/dump.rdb"
gzip "${REDIS_BACKUP_DIR}/dump.rdb"

echo "[OK] Redis backup completed"

# === QDRANT BACKUP ===
echo "[3/3] Backing up Qdrant..."
QDRANT_BACKUP_DIR="${BACKUP_ROOT}/qdrant"
mkdir -p "${QDRANT_BACKUP_DIR}"

COLLECTIONS=("rules_embeddings" "examples_embeddings" "templates_embeddings")

for collection in "${COLLECTIONS[@]}"; do
  echo "[INFO] Snapshotting ${collection}..."
  
  response=$(curl -s -X POST "${QDRANT_URL}/collections/${collection}/snapshots" \
    -H "api-key: ${QDRANT_API_KEY}")
  
  snapshot_name=$(echo "${response}" | jq -r '.result.name')
  
  curl -s -X GET "${QDRANT_URL}/collections/${collection}/snapshots/${snapshot_name}" \
    -H "api-key: ${QDRANT_API_KEY}" \
    -o "${QDRANT_BACKUP_DIR}/${collection}_${snapshot_name}"
done

echo "[OK] Qdrant backup completed"

# === UPLOAD TO YANDEX OBJECT STORAGE ===
echo "[INFO] Uploading to Yandex Object Storage..."

aws s3 sync "${BACKUP_ROOT}" "s3://${S3_BUCKET}/full_backup/${TIMESTAMP}/" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region ru-central1

# Cleanup local backup
rm -rf "${BACKUP_ROOT}"

echo "================================"
echo "[SUCCESS] Backup completed: ${TIMESTAMP}"
echo "Location: s3://${S3_BUCKET}/full_backup/${TIMESTAMP}/"
echo "================================"

# Cleanup old backups (keep last 30 days)
CUTOFF_DATE=$(date -d '30 days ago' +%Y%m%d)

aws s3 ls "s3://${S3_BUCKET}/full_backup/" --endpoint-url "${S3_ENDPOINT}" \
  | awk '{print $2}' | while read -r folder; do
    folder_date=$(echo "${folder}" | sed 's/_.*//; s/\///')
    if [ -n "${folder_date}" ] && [ "${folder_date}" -lt "${CUTOFF_DATE}" ]; then
      echo "[INFO] Deleting old backup: ${folder}"
      aws s3 rm "s3://${S3_BUCKET}/full_backup/${folder}" --recursive \
        --endpoint-url "${S3_ENDPOINT}"
    fi
  done
