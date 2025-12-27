#!/bin/bash
# TD-06 Task 26: Let's Encrypt SSL certificate renewal script
# Run this via cron: 0 3 * * * /path/to/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1

set -e

COMPOSE_FILE="./docker-compose.prod.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_DIR"

echo "========================================"
echo "Let's Encrypt Certificate Renewal"
echo "Started at: $(date)"
echo "========================================"

# Try to renew certificates
# Certbot will only renew if certificates are close to expiry (within 30 days)
docker-compose -f "$COMPOSE_FILE" run --rm certbot renew

# Reload nginx if any certificates were renewed
# Check exit code of certbot (0 = success, 1 = no renewal needed)
if [ $? -eq 0 ]; then
    echo "Reloading nginx to apply renewed certificates..."
    docker-compose -f "$COMPOSE_FILE" exec nginx nginx -s reload
    echo "Nginx reloaded successfully"
else
    echo "No certificates were renewed (not due for renewal)"
fi

echo "========================================"
echo "Certificate renewal check completed"
echo "Finished at: $(date)"
echo "========================================"
