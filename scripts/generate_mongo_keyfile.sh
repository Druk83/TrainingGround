#!/bin/bash
# Generate cryptographically secure MongoDB replica set keyfile
# Usage: ./scripts/generate_mongo_keyfile.sh [output_path]

set -euo pipefail

OUTPUT_PATH="${1:-infra/mongo-keyfile}"
BACKUP_PATH="${OUTPUT_PATH}.backup.$(date +%Y%m%d_%H%M%S)"

# Backup existing keyfile if present
if [ -f "$OUTPUT_PATH" ]; then
    echo "[INFO] Backing up existing keyfile to $BACKUP_PATH"
    cp "$OUTPUT_PATH" "$BACKUP_PATH"
fi

# Generate new keyfile (756 bytes base64 = 1008 chars)
echo "[INFO] Generating new MongoDB keyfile..."
openssl rand -base64 756 > "$OUTPUT_PATH"

# Set correct permissions (read-only for owner)
chmod 400 "$OUTPUT_PATH"

echo "[OK] MongoDB keyfile generated at $OUTPUT_PATH"
echo "[OK] Permissions set to 400 (read-only for owner)"
echo ""
echo "SECURITY WARNINGS:"
echo "1. NEVER commit this file to git"
echo "2. Copy this file to ALL replica set members"
echo "3. Restart MongoDB after updating keyfile"
echo "4. Keep backup in secure location"
echo ""
echo "NEXT STEPS:"
echo "1. Verify file: head -c 100 $OUTPUT_PATH | base64 -d"
echo "2. Check permissions: ls -l $OUTPUT_PATH"
echo "3. Update docker-compose.yml if needed"
echo "4. Restart MongoDB: docker compose restart mongodb-primary mongodb-secondary"
