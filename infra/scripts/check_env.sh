#!/bin/bash
set -e

ROOT_DIR="$(dirname "$0")/.."
ENV_FILE="$ROOT_DIR/../.env"

echo "Checking essential environment variables..."

required=( MONGO_USER MONGO_PASSWORD REDIS_PASSWORD JWT_SECRET QDRANT_API_KEY GRAFANA_PASSWORD )
weak_values=( "admin" "password" "redispass" "your-secret-key-change-in-prod" "qdrantkey" "admin" "changeme" "changeMe" "changeMe123" )

WARNINGS=0
ERRORS=0

for name in "${required[@]}"; do
  val=$(grep -E "^${name}=" -m1 "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)

  if [ -z "$val" ]; then
    echo "[ERROR] $name is not set in $ENV_FILE"
    ERRORS=$((ERRORS+1))
    continue
  fi

  # Check if value is weak/default
  is_weak=false
  for weak in "${weak_values[@]}"; do
    if [ "$val" = "$weak" ]; then
      is_weak=true
      break
    fi
  done

  if $is_weak; then
    echo "[WARN] $name is set to weak/default value in $ENV_FILE"
    WARNINGS=$((WARNINGS+1))
  elif [ ${#val} -lt 12 ]; then
    echo "[WARN] $name is too short (${#val} chars, minimum 12)"
    WARNINGS=$((WARNINGS+1))
  else
    echo "[OK] $name is set securely"
  fi
done

echo ""
echo "=========================================="
echo "Check complete: $ERRORS errors, $WARNINGS warnings"
echo "=========================================="

if [ $ERRORS -gt 0 ]; then
  echo "FATAL: Required environment variables are missing!"
  echo "Run: cp .env.example .env"
  echo "Then: bash infra/scripts/generate_secrets.sh"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo "WARNING: Weak passwords detected!"
  echo "Generate strong passwords: bash infra/scripts/generate_secrets.sh"
  exit 0
else
  echo "All environment variables are set securely"
  exit 0
fi
