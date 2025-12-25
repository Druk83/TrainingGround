#!/usr/bin/env bash
# Bootstrap superuser from secret seed file
#
# Usage:
#   ADMIN_SEED_FILE=/path/to/secret.json ./scripts/bootstrap-superuser.sh
#
# Or with explicit path:
#   ./scripts/bootstrap-superuser.sh /path/to/secret.json
#
# Security notes:
# - The seed file MUST contain a secure password field
# - Password will be hashed with bcrypt (cost=12) before storage
# - File will NOT be deleted after use (for idempotency)
# - Superuser is created only once (upsert with $setOnInsert)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine seed file path
SEED_FILE="${1:-${ADMIN_SEED_FILE:-infra/config/seed/admin-superuser.json}}"

# Validate seed file exists
if [[ ! -f "$SEED_FILE" ]]; then
    echo -e "${RED}ERROR: Seed file not found: $SEED_FILE${NC}" >&2
    echo "Generate one using: python3 scripts/generate_superuser_secret.py" >&2
    exit 1
fi

# Check if it's the example file (security check)
if [[ "$SEED_FILE" == *"example.json" ]]; then
    echo -e "${RED}ERROR: Cannot use example file for production!${NC}" >&2
    echo "Generate a real secret file using: python3 scripts/generate_superuser_secret.py" >&2
    exit 1
fi

# Validate JSON structure
if ! python3 -c "import json, sys; json.load(open('$SEED_FILE'))" 2>/dev/null; then
    echo -e "${RED}ERROR: Invalid JSON in seed file${NC}" >&2
    exit 1
fi

# Check required fields
REQUIRED_FIELDS=("email" "name" "role" "password")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! python3 -c "import json; d=json.load(open('$SEED_FILE')); exit(0 if '$field' in d else 1)" 2>/dev/null; then
        echo -e "${RED}ERROR: Required field '$field' missing from seed file${NC}" >&2
        exit 1
    fi
done

# Warn if password looks insecure
PASSWORD_LENGTH=$(python3 -c "import json; print(len(json.load(open('$SEED_FILE')).get('password', '')))")
if [[ "$PASSWORD_LENGTH" -lt 16 ]]; then
    echo -e "${YELLOW}WARNING: Password is shorter than 16 characters (current: $PASSWORD_LENGTH)${NC}" >&2
fi

echo -e "${GREEN}✓${NC} Seed file validated: $SEED_FILE"

# Export the path for the API
export ADMIN_SEED_FILE="$SEED_FILE"

echo -e "${YELLOW}Starting API with superuser bootstrap...${NC}"
echo "Superuser will be created on first startup if it doesn't exist."
echo ""

# Run the API (this will trigger the bootstrap via AppState::new)
# In production, this would be handled by your deployment system
# For local testing:
cd backend/rust-api
cargo run --bin trainingground-api
