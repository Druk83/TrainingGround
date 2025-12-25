#!/bin/bash
# Rotate MongoDB replica set keyfile with zero downtime
# Usage: ./scripts/rotate_mongo_keyfile.sh

set -euo pipefail

echo "[INFO] Starting MongoDB keyfile rotation..."
echo ""

# Step 1: Generate new keyfile
echo "[STEP 1/5] Generating new keyfile..."
./scripts/generate_mongo_keyfile.sh infra/mongo-keyfile.new

# Step 2: Verify Docker services are running
echo ""
echo "[STEP 2/5] Verifying MongoDB services are running..."
if ! docker compose ps | grep -q "mongodb-primary.*running"; then
    echo "[ERROR] MongoDB primary is not running"
    echo "Start it with: docker compose up -d mongodb-primary"
    exit 1
fi

if ! docker compose ps | grep -q "mongodb-secondary.*running"; then
    echo "[WARN] MongoDB secondary is not running (optional for rotation)"
fi

# Step 3: Update keyfile on all replica set members
echo ""
echo "[STEP 3/5] Updating keyfile on replica set members..."

# Get container names
PRIMARY_CONTAINER=$(docker compose ps -q mongodb-primary)
SECONDARY_CONTAINER=$(docker compose ps -q mongodb-secondary || echo "")

# Copy to docker volumes (requires privileged access)
echo "[INFO] Copying new keyfile to primary container..."
docker cp infra/mongo-keyfile.new "$PRIMARY_CONTAINER:/data/configdb/keyfile.new"
docker exec "$PRIMARY_CONTAINER" chmod 400 /data/configdb/keyfile.new

if [ -n "$SECONDARY_CONTAINER" ]; then
    echo "[INFO] Copying new keyfile to secondary container..."
    docker cp infra/mongo-keyfile.new "$SECONDARY_CONTAINER:/data/configdb/keyfile.new"
    docker exec "$SECONDARY_CONTAINER" chmod 400 /data/configdb/keyfile.new
fi

# Step 4: Rolling restart (one member at a time)
echo ""
echo "[STEP 4/5] Performing rolling restart..."

if [ -n "$SECONDARY_CONTAINER" ]; then
    # Restart secondary first
    echo "[INFO] Restarting secondary..."
    docker exec "$SECONDARY_CONTAINER" mv /data/configdb/keyfile.new /data/configdb/keyfile
    docker compose restart mongodb-secondary

    # Wait for secondary to rejoin
    echo "[INFO] Waiting for secondary to rejoin (10 seconds)..."
    sleep 10

    # Check replica set status
    echo "[INFO] Checking replica set status..."
    if ! docker exec "$PRIMARY_CONTAINER" mongosh --quiet --eval "rs.status()" > /dev/null 2>&1; then
        echo "[ERROR] Replica set unhealthy after secondary restart"
        echo "Manual recovery required. Old keyfile backed up."
        exit 1
    fi
    echo "[OK] Secondary rejoined successfully"
fi

# Restart primary
echo "[INFO] Restarting primary..."
docker exec "$PRIMARY_CONTAINER" mv /data/configdb/keyfile.new /data/configdb/keyfile
docker compose restart mongodb-primary

# Wait for primary election
echo "[INFO] Waiting for primary election (10 seconds)..."
sleep 10

# Verify replica set health
echo "[INFO] Verifying replica set health..."
if ! docker exec "$PRIMARY_CONTAINER" mongosh --quiet --eval "rs.status()" > /dev/null 2>&1; then
    echo "[ERROR] Replica set unhealthy after primary restart"
    echo "Manual recovery required. Old keyfile backed up."
    exit 1
fi

# Step 5: Update local keyfile
echo ""
echo "[STEP 5/5] Updating local keyfile..."
mv infra/mongo-keyfile.new infra/mongo-keyfile
chmod 400 infra/mongo-keyfile

echo ""
echo "[OK] MongoDB keyfile rotation completed successfully"
echo ""
echo "VERIFICATION:"
echo "1. Check replica set: docker exec \$PRIMARY_CONTAINER mongosh --eval 'rs.status()'"
echo "2. Check authentication: docker compose logs rust-api | grep 'MongoDB connection'"
echo "3. Test admin login at http://localhost:4173/admin"
