# Nginx Reverse Proxy with Let's Encrypt SSL

Production HTTPS setup with TLS 1.3/1.2, strong cipher suites, and automatic certificate renewal.

## Quick Start (Production Deployment)

### Prerequisites

- Domain name pointed to your server (A/AAAA records)
- Docker and Docker Compose installed
- Ports 80 and 443 open in firewall

### 1. Update Domain Configuration

Edit `infra/nginx/init-letsencrypt.sh`:

```bash
DOMAINS=(trainingground.ru www.trainingground.ru)
EMAIL="admin@trainingground.ru"  # CHANGE THIS!
```

Edit `infra/nginx/conf.d/trainingground.conf`:

```nginx
server_name trainingground.ru www.trainingground.ru;  # CHANGE THIS!
```

### 2. Build Frontend

```bash
cd frontend
npm install
npm run build
# Verify: ls dist/ should contain index.html
```

### 3. Initialize Let's Encrypt Certificates

```bash
# Test with staging server first (to avoid rate limits)
STAGING=1 bash infra/nginx/init-letsencrypt.sh

# If successful, get production certificate
STAGING=0 bash infra/nginx/init-letsencrypt.sh
```

### 4. Start Production Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Verify SSL Configuration

- Visit: https://trainingground.ru (внимание не настоящий адрес!!!)
- Test SSL: https://www.ssllabs.com/ssltest/analyze.html?d=trainingground.ru
- Expected grade: **A or A+**

## Certificate Auto-Renewal

Certbot automatically renews certificates within 30 days of expiry.

### Setup Cron Job (Linux)

```bash
# Add to crontab (runs daily at 3 AM)
crontab -e

# Add this line:
0 3 * * * /path/to/MishaGame/infra/nginx/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1
```

### Manual Renewal

```bash
docker-compose -f docker-compose.prod.yml run --rm certbot renew
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Security Features

### TLS Configuration

- **Protocols:** TLSv1.3, TLSv1.2 only (TLS 1.0/1.1 disabled)
- **Cipher Suites:** Mozilla Modern configuration
  - TLS 1.3: ChaCha20-Poly1305, AES-128-GCM, AES-256-GCM (automatic)
  - TLS 1.2: ECDHE-ECDSA/RSA-AES-GCM, CHACHA20-POLY1305, DHE-RSA-AES-GCM
- **OCSP Stapling:** Enabled
- **Session Cache:** 10MB shared cache

### Security Headers

- **HSTS:** `max-age=31536000; includeSubDomains` (без `preload` для соответствия ФЗ-152 - HSTS Preload List управляется Google (США), что может противоречить требованиям локализации данных)
- **X-Frame-Options:** DENY
- **X-Content-Type-Options:** nosniff
- **X-XSS-Protection:** 1; mode=block
- **Referrer-Policy:** strict-origin-when-cross-origin
- **CSP:** default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...

### Rate Limiting

- **API:** 10 req/s per IP (burst 20)
- **Login:** 5 req/min per IP (burst 5)
- **Register:** 5 req/min per IP (burst 3)
- **Max Connections:** 10 per IP

## File Structure

```
infra/nginx/
├── nginx.conf                     # Main Nginx config
├── conf.d/
│   └── trainingground.conf        # Virtual host (HTTPS + upstreams)
├── ssl/                            # SSL certificates (mounted from certbot)
├── certbot/
│   ├── conf/                       # Let's Encrypt certificates
│   └── www/                        # ACME challenge directory
├── init-letsencrypt.sh             # Initial certificate setup
├── certbot-renew.sh                # Renewal script (for cron)
└── README.md                       # This file
```

## Configuration Details

### Upstream Backends

```nginx
upstream rust_api {
    server rust-api:8081;
    keepalive 32;
}

upstream python_generator {
    server python-generator:8082;
    keepalive 16;
}
```

### Frontend (PWA)

- **Location:** `/`
- **Root:** `/usr/share/nginx/html` (mounted from `frontend/dist`)
- **SPA routing:** `try_files $uri $uri/ /index.html`
- **Static cache:** 1 year for `.js`, `.css`, images, fonts

### API Proxying

- **Rust API:** `/api/v1/` → `http://rust-api:8081`
- **Python Generator:** `/api/v1/generator/` → `http://python-generator:8082`
- **Timeouts:** 60s (API), 120s (generator)

## Troubleshooting

### Certificate Errors

**Problem:** Certificate not found

```bash
# Check certificate files
ls -la infra/nginx/certbot/conf/live/trainingground.ru/

# Should contain:
# - fullchain.pem
# - privkey.pem
# - chain.pem
```

**Solution:** Re-run init-letsencrypt.sh

### Rate Limit Hit

**Problem:** Let's Encrypt rate limit (5 certificates per domain per week)

**Solution:** Use staging mode for testing:

```bash
STAGING=1 bash infra/nginx/init-letsencrypt.sh
```

### Nginx Won't Start

```bash
# Check Nginx config syntax
docker-compose -f docker-compose.prod.yml exec nginx nginx -t

# Check logs
docker-compose -f docker-compose.prod.yml logs nginx
```

### SSL Labs Grade < A

**Possible issues:**
- Old cipher suites enabled (check nginx.conf)
- HSTS not configured
- Certificate chain incomplete

**Fix:** Verify `ssl_protocols` and `ssl_ciphers` in trainingground.conf

## Monitoring

### Check Certificate Expiry

```bash
docker-compose -f docker-compose.prod.yml run --rm certbot certificates
```

### Nginx Access Logs

```bash
docker-compose -f docker-compose.prod.yml logs -f nginx | grep -v "GET /health"
```

### Test HTTPS

```bash
curl -I https://trainingground.ru
# Should return:
# HTTP/2 200
# strict-transport-security: max-age=31536000; includeSubDomains; preload
```

## Production Checklist

Before going live:

- [ ] Domain DNS configured (A/AAAA records)
- [ ] Frontend built (`frontend/dist/index.html` exists)
- [ ] `.env` configured with production secrets (copy from .env.example)
- [ ] `COOKIE_SECURE=true` in environment
- [ ] Let's Encrypt production certificate obtained (not staging)
- [ ] Cron job for certificate renewal configured
- [ ] SSL Labs test passed (grade A or A+)
- [ ] Firewall rules allow ports 80, 443
- [ ] MongoDB keyfile permissions: 400
- [ ] Admin superuser seed file exists and secured
- [ ] HSTS header configured without `preload` (ФЗ-152 compliance)

## References

- Mozilla SSL Configuration Generator: https://ssl-config.mozilla.org/
- Let's Encrypt Documentation: https://letsencrypt.org/docs/
- Nginx Docker Hub: https://hub.docker.com/_/nginx
- SSL Labs Test: https://www.ssllabs.com/ssltest/
- DuckDNS (free staging domain): https://www.duckdns.org/

## Deployment с реальным доменом

Проверка SSL конфигурации на реальном домене (staging или production) вынесена в отдельную задачу:
- [tasks/TD-06-27.md](../../tasks/TD-06-27.md) - HSTS header configuration и SSL deployment проверка

В этом документе описаны:
- Варианты доменов (DuckDNS для staging, покупка домена для production)
- Чек-лист deployment
- Проверка через SSL Labs и http.itsoft.ru
- Правовое обоснование по ФЗ-152 (почему без preload)
