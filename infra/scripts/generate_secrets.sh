#!/bin/bash
# Generate secure random passwords for TrainingGround services
# Usage: bash infra/scripts/generate_secrets.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

echo "TrainingGround Secrets Generator"
echo "===================================="
echo ""

# Function to generate secure random password
generate_password() {
    local length=${1:-32}
    # Generate random base64 string and clean it up
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Function to generate JWT secret (longer for better security)
generate_jwt_secret() {
    openssl rand -hex 64
}

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo ".env not found, copying from .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

echo "Generating secure passwords..."
echo ""

# Backup existing .env
BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"
echo ""

# Generate passwords
MONGO_USER="admin"
MONGO_PASSWORD=$(generate_password 24)
REDIS_PASSWORD=$(generate_password 32)
QDRANT_API_KEY=$(generate_password 32)
JWT_SECRET=$(generate_jwt_secret)
GRAFANA_PASSWORD=$(generate_password 20)

# Update .env file
update_env_var() {
    local key=$1
    local value=$2
    if grep -q "^${key}=" "$ENV_FILE"; then
        # Update existing variable
        sed -i.tmp "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        rm -f "$ENV_FILE.tmp"
    else
        # Append new variable
        echo "${key}=${value}" >> "$ENV_FILE"
    fi
}

echo "Updating .env file with generated secrets..."

update_env_var "MONGO_USER" "$MONGO_USER"
update_env_var "MONGO_PASSWORD" "$MONGO_PASSWORD"
update_env_var "REDIS_PASSWORD" "$REDIS_PASSWORD"
update_env_var "QDRANT_API_KEY" "$QDRANT_API_KEY"
update_env_var "JWT_SECRET" "$JWT_SECRET"
update_env_var "GRAFANA_PASSWORD" "$GRAFANA_PASSWORD"

# Also update MONGODB_URI if it exists
MONGODB_URI="mongodb://\${MONGO_USER}:\${MONGO_PASSWORD}@localhost:27017/trainingground"
update_env_var "MONGODB_URI" "$MONGODB_URI"

echo ""
echo "Secrets generated successfully!"
echo ""
echo "================================================"
echo "Generated Credentials (SAVE THESE SECURELY!)"
echo "================================================"
echo ""
echo "MongoDB:"
echo "  User:     $MONGO_USER"
echo "  Password: $MONGO_PASSWORD"
echo ""
echo "Redis:"
echo "  Password: $REDIS_PASSWORD"
echo ""
echo "Qdrant:"
echo "  API Key:  $QDRANT_API_KEY"
echo ""
echo "JWT:"
echo "  Secret:   $JWT_SECRET"
echo ""
echo "Grafana:"
echo "  Admin:    admin"
echo "  Password: $GRAFANA_PASSWORD"
echo ""
echo "================================================"
echo ""
echo "IMPORTANT:"
echo "1. Credentials saved to: $ENV_FILE"
echo "2. Backup created at: $BACKUP_FILE"
echo "3. Do NOT commit .env to git!"
echo "4. For production, store secrets in Yandex Lockbox or HashiCorp Vault"
echo ""
echo "Next steps:"
echo "1. Review the .env file"
echo "2. Run: docker-compose down -v"
echo "3. Run: docker-compose up -d"
echo "4. Save credentials to password manager"
echo ""
