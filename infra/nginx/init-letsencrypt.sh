#!/bin/bash
# TD-06 Task 26: Let's Encrypt SSL certificate initialization script
# Based on https://github.com/wmnnd/nginx-certbot

set -e

# Configuration
DOMAINS=(trainingground.ru www.trainingground.ru)
EMAIL="admin@trainingground.ru"  # Change this to your email
STAGING=${STAGING:-0}  # Set to 1 for testing
RSA_KEY_SIZE=4096
DATA_PATH="./infra/nginx/certbot"
NGINX_CONF_PATH="./infra/nginx"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================"
echo "Let's Encrypt SSL Setup"
echo "======================================${NC}"

# Check if certificates already exist
if [ -d "$DATA_PATH/conf/live/${DOMAINS[0]}" ]; then
  echo -e "${YELLOW}Existing certificates found for ${DOMAINS[0]}${NC}"
  read -p "Do you want to replace them? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Exiting..."
    exit 0
  fi
fi

# Download recommended TLS parameters if not present
if [ ! -e "$DATA_PATH/conf/options-ssl-nginx.conf" ] || [ ! -e "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
  echo -e "${GREEN}Downloading recommended TLS parameters...${NC}"
  mkdir -p "$DATA_PATH/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$DATA_PATH/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$DATA_PATH/conf/ssl-dhparams.pem"
  echo
fi

# Create dummy certificate for nginx to start
echo -e "${GREEN}Creating dummy certificate for ${DOMAINS[0]}...${NC}"
CERT_PATH="/etc/letsencrypt/live/${DOMAINS[0]}"
mkdir -p "$DATA_PATH/conf/live/${DOMAINS[0]}"
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

# Start nginx with dummy certificate
echo -e "${GREEN}Starting nginx...${NC}"
docker-compose -f docker-compose.prod.yml up --force-recreate -d nginx
echo

# Delete dummy certificate
echo -e "${GREEN}Deleting dummy certificate for ${DOMAINS[0]}...${NC}"
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${DOMAINS[0]} && \
  rm -Rf /etc/letsencrypt/archive/${DOMAINS[0]} && \
  rm -Rf /etc/letsencrypt/renewal/${DOMAINS[0]}.conf" certbot
echo

# Request real certificate
echo -e "${GREEN}Requesting Let's Encrypt certificate for ${DOMAINS[0]}...${NC}"

# Build domain arguments
DOMAIN_ARGS=""
for domain in "${DOMAINS[@]}"; do
  DOMAIN_ARGS="$DOMAIN_ARGS -d $domain"
done

# Select appropriate endpoint
if [ $STAGING != "0" ]; then
  STAGING_ARG="--staging"
  echo -e "${YELLOW}Using Let's Encrypt STAGING server (for testing)${NC}"
else
  STAGING_ARG=""
  echo -e "${GREEN}Using Let's Encrypt PRODUCTION server${NC}"
fi

# Request certificate
docker-compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    $DOMAIN_ARGS \
    --email $EMAIL \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot
echo

# Reload nginx to use new certificate
echo -e "${GREEN}Reloading nginx...${NC}"
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo -e "${GREEN}======================================"
echo "SSL certificate successfully installed!"
echo "======================================${NC}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Verify certificate: https://${DOMAINS[0]}"
echo "2. Check SSL rating: https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAINS[0]}"
echo "3. Certificates will auto-renew via cron job (see certbot-renew.sh)"
echo
echo -e "${YELLOW}Certificate details:${NC}"
docker-compose -f docker-compose.prod.yml run --rm certbot certificates
