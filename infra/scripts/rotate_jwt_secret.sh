#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_jwt_secret>"
  exit 1
fi

NEW_SECRET="$1"

ENV_FILE="$(dirname "$0")/../../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Cannot find .env at $ENV_FILE"
  exit 1
fi

echo "Updating JWT_SECRET in $ENV_FILE"
# Replace or add JWT_SECRET
if grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=${NEW_SECRET}/" "$ENV_FILE"
else
  echo "JWT_SECRET=${NEW_SECRET}" >> "$ENV_FILE"
fi

echo "Restarting services to pick up new secret..."
docker-compose restart || true

echo "Done. Don't forget to rotate any external JWT consumers if needed."
