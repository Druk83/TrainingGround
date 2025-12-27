# Production Deployment Security Guide

Comprehensive руководство по безопасному деплою TrainingGround Platform в production окружение.

## Содержание

- [Pre-production Checklist](#pre-production-checklist)
- [Deployment Options](#deployment-options)
  - [Docker Compose Production](#docker-compose-production)
  - [Kubernetes](#kubernetes)
  - [Cloud Providers](#cloud-providers)
- [HTTPS + HSTS Setup](#https--hsts-setup)
- [MongoDB Replica Set Security](#mongodb-replica-set-security)
- [Secrets Management](#secrets-management)
- [Environment Variables](#environment-variables)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Disaster Recovery](#backup--disaster-recovery)

---

## Pre-production Checklist

### Критические требования безопасности

#### Секреты и ключи
- [ ] JWT_SECRET сгенерирован криптографически стойким методом (`openssl rand -base64 32`)
- [ ] JWT_SECRET НЕ закоммичен в Git
- [ ] MongoDB MONGO_PASSWORD изменен с дефолтного (≥16 символов)
- [ ] Redis REDIS_PASSWORD изменен с дефолтного
- [ ] Vault VAULT_ROOT_TOKEN изменен и сохранен в безопасном месте
- [ ] admin-superuser.json НЕ в Git, хранится в Vault/Kubernetes Secrets
- [ ] Все пароли соответствуют политике: ≥16 символов, lowercase + uppercase + digits + symbols

#### HTTPS и транспортная безопасность
- [ ] HTTPS включен (TLS 1.3 или TLS 1.2)
- [ ] SSL сертификат валидный (не self-signed в production)
- [ ] HSTS header настроен: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- [ ] HTTP редиректит на HTTPS (301 Moved Permanently)
- [ ] COOKIE_SECURE=true в .env

#### Cookies и session security
- [ ] Refresh tokens в HTTP-only cookies
- [ ] SameSite=Strict (или Lax если нужны cross-site requests)
- [ ] Secure flag включен
- [ ] Cookie path ограничен: `/api/v1/auth`

#### CSRF Protection
- [ ] CSRF middleware включен
- [ ] CSRF токены генерируются для всех state-changing операций
- [ ] Frontend отправляет X-CSRF-Token header

#### CSP (Content Security Policy)
- [ ] CSP headers настроены
- [ ] `frame-ancestors 'none'` для защиты от clickjacking
- [ ] `default-src 'self'` как baseline

#### Rate Limiting
- [ ] Login rate limiting: 10 попыток/5 мин per IP
- [ ] Register rate limiting: 5 регистраций/час per IP
- [ ] General API rate limiting: 100 req/min per user, 200 req/min per IP
- [ ] Redis доступен для rate limiting storage

#### MongoDB Security
- [ ] Replica set с keyfile аутентификацией
- [ ] Authentication включен (authSource=admin)
- [ ] Encryption at Rest настроен (Vault + CSFLE для PII)
- [ ] Network isolation (только backend имеет доступ)

#### Vault Security
- [ ] Vault НЕ в dev режиме
- [ ] Vault unsealed
- [ ] HA конфигурация (Consul/etcd backend)
- [ ] TLS для Vault API
- [ ] AppRole authentication для приложений
- [ ] Audit logging включен

#### Logging и мониторинг
- [ ] Audit logs для всех критических операций
- [ ] Failed authentication attempts логируются
- [ ] Prometheus scraping работает
- [ ] Grafana дашборды настроены
- [ ] Алерты настроены

#### Deployment
- [ ] Docker images версионированы (не :latest)
- [ ] Health checks работают
- [ ] Resource limits установлены (CPU, memory)

#### Backup
- [ ] MongoDB backup настроен (ежедневно)
- [ ] Vault backup настроен
- [ ] Restore procedure протестирована

---

## Deployment Options

### Docker Compose Production

#### Production docker-compose.prod.yml

```yaml
version: '3.9'

services:
  # MongoDB Replica Set с keyfile authentication
  mongodb-primary:
    image: mongo:6
    restart: always
    ports:
      - "127.0.0.1:27017:27017"  # Bind только к localhost
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    command: >
      bash -c "
        chmod 400 /data/keyfile/mongo-keyfile &&
        chown mongodb:mongodb /data/keyfile/mongo-keyfile &&
        exec docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile /data/keyfile/mongo-keyfile
      "
    volumes:
      - mongodb_primary_data:/data/db
      - ./infra/mongo-keyfile.secure:/data/keyfile/mongo-keyfile:ro
    networks:
      - trainingground-network
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  # HashiCorp Vault (production mode с Consul backend)
  vault:
    image: hashicorp/vault:1.15
    restart: always
    ports:
      - "127.0.0.1:8200:8200"
    cap_add:
      - IPC_LOCK
    volumes:
      - ./infra/vault/tls:/vault/tls:ro
      - ./infra/vault/config:/vault/config:ro
    networks:
      - trainingground-network
    command: server
    depends_on:
      - consul

  consul:
    image: consul:1.17
    restart: always
    command: agent -server -bootstrap-expect=1 -ui -client=0.0.0.0
    volumes:
      - consul_data:/consul/data
    networks:
      - trainingground-network

  # Nginx reverse proxy с HTTPS
  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - trainingground-network
    depends_on:
      - rust-api

  rust-api:
    build:
      context: ./backend/rust-api
    restart: always
    environment:
      APP_ENV: prod
      RUST_LOG: info
      COOKIE_SECURE: "true"
      VAULT_ADDR: http://vault:8200
      VAULT_ROLE_ID: ${VAULT_ROLE_ID}
      VAULT_SECRET_ID: ${VAULT_SECRET_ID}
    networks:
      - trainingground-network
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G

volumes:
  mongodb_primary_data:
  consul_data:

networks:
  trainingground-network:
    driver: bridge
```

#### Запуск production deployment

```bash
# 1. Создать production .env
cp .env.example .env.prod
# Заполнить STRONG passwords

# 2. Генерировать SSL сертификаты
./infra/scripts/generate-ssl-certs.sh

# 3. Запуск
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. Инициализация Vault
docker-compose exec vault vault operator init
# СОХРАНИТЬ unseal keys и root token!

# 5. Unseal Vault
docker-compose exec vault vault operator unseal <key1>
docker-compose exec vault vault operator unseal <key2>
docker-compose exec vault vault operator unseal <key3>

# 6. Инициализация encryption keys
./infra/vault/init-mongodb-encryption.sh

# 7. Health check
curl https://your-domain.com/health
```

---

### Kubernetes

#### Kubernetes Secrets для admin-superuser.json

**ВАЖНО:** НЕ коммитить admin-superuser.json в Git!

```bash
# Создать secret из файла
kubectl create secret generic admin-superuser \
  --from-file=admin-superuser.json=./infra/config/seed/admin-superuser.json \
  --namespace=trainingground

# Или из Vault (рекомендуется)
vault kv get -field=data secret/admin/superuser | \
  kubectl create secret generic admin-superuser \
  --from-file=admin-superuser.json=/dev/stdin \
  --namespace=trainingground
```

#### Rust API Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rust-api
  namespace: trainingground
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rust-api
  template:
    metadata:
      labels:
        app: rust-api
    spec:
      containers:
      - name: rust-api
        image: trainingground/rust-api:v1.0.0
        ports:
        - containerPort: 8081
        env:
        - name: APP_ENV
          value: "prod"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: mongodb-credentials
              key: uri
        - name: ADMIN_SEED_FILE
          value: "/secrets/admin-superuser.json"
        volumeMounts:
        - name: admin-secret
          mountPath: /secrets
          readOnly: true
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "8Gi"
            cpu: "4"
        livenessProbe:
          httpGet:
            path: /health
            port: 8081
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8081
          initialDelaySeconds: 10
      volumes:
      - name: admin-secret
        secret:
          secretName: admin-superuser
---
apiVersion: v1
kind: Service
metadata:
  name: rust-api
  namespace: trainingground
spec:
  selector:
    app: rust-api
  ports:
  - port: 8081
    targetPort: 8081
```

#### Ingress с HTTPS + HSTS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: trainingground
  namespace: trainingground
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - trainingground.example.com
    secretName: trainingground-tls
  rules:
  - host: trainingground.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: rust-api
            port:
              number: 8081
```

#### MongoDB StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: trainingground
spec:
  serviceName: mongodb
  replicas: 3
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:6
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          valueFrom:
            secretKeyRef:
              name: mongodb-credentials
              key: username
        - name: MONGO_INITDB_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mongodb-credentials
              key: password
        command:
        - mongod
        - --replSet
        - rs0
        - --bind_ip_all
        - --keyFile
        - /data/keyfile/mongo-keyfile
        volumeMounts:
        - name: mongodb-data
          mountPath: /data/db
        - name: mongodb-keyfile
          mountPath: /data/keyfile
          readOnly: true
      volumes:
      - name: mongodb-keyfile
        secret:
          secretName: mongodb-keyfile
          defaultMode: 0400
  volumeClaimTemplates:
  - metadata:
      name: mongodb-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 100Gi
```

---

### Cloud Providers

#### AWS ECS

```json
{
  "family": "trainingground-rust-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "containerDefinitions": [{
    "name": "rust-api",
    "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/rust-api:latest",
    "portMappings": [{"containerPort": 8081}],
    "secrets": [
      {
        "name": "JWT_SECRET",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:jwt-secret"
      }
    ],
    "environment": [
      {"name": "APP_ENV", "value": "prod"},
      {"name": "COOKIE_SECURE", "value": "true"}
    ]
  }]
}
```

#### Azure Container Instances

```bash
az keyvault create --name trainingground-vault --resource-group trainingground
az keyvault secret set --vault-name trainingground-vault --name jwt-secret --value "$(openssl rand -base64 32)"

az container create \
  --resource-group trainingground \
  --name rust-api \
  --image trainingground/rust-api:latest \
  --cpu 2 --memory 4 \
  --secure-environment-variables \
    JWT_SECRET="$(az keyvault secret show --vault-name trainingground-vault --name jwt-secret -o tsv)"
```

#### GCP Cloud Run

```bash
gcloud secrets create jwt-secret --data-file=- <<< "$(openssl rand -base64 32)"

gcloud run deploy rust-api \
  --image gcr.io/project-id/rust-api:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars APP_ENV=prod,COOKIE_SECURE=true \
  --set-secrets=JWT_SECRET=jwt-secret:latest \
  --memory 4Gi --cpu 2
```

---

## HTTPS + HSTS Setup

### Nginx Reverse Proxy

**infra/nginx/nginx.conf:**

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name trainingground.example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name trainingground.example.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_dhparam /etc/nginx/dhparam.pem;

    # TLS 1.3 + 1.2
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CSP Header
    add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none';" always;

    # Proxy to Rust API
    location /api {
        proxy_pass http://rust-api:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL Certificates

**Let's Encrypt (рекомендуется):**

```bash
# Установка certbot
sudo apt-get install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d trainingground.example.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

**Self-signed (только для testing):**

```bash
# DH параметры
openssl dhparam -out dhparam.pem 2048

# Self-signed сертификат
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/CN=trainingground.local"
```

### Проверка HSTS

```bash
curl -I https://trainingground.example.com
# Должен быть: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## MongoDB Replica Set Security

### Keyfile Authentication (уже настроено)

```bash
# Генерация keyfile
openssl rand -base64 756 > infra/mongo-keyfile.secure
chmod 400 infra/mongo-keyfile.secure

# Добавить в .gitignore
echo "infra/mongo-keyfile.secure" >> .gitignore
```

### Проверка replica set

```bash
docker-compose exec mongodb-primary mongosh -u admin -p <password> --authenticationDatabase admin

# В mongosh:
rs.status()
# Должны быть все 3 узла с keyfile authentication
```

### MongoDB Encryption at Rest

См. [infra/vault/README.md](../infra/vault/README.md) для полной документации CSFLE.

```bash
# Проверка шифрования
mongosh --host mongodb-primary:27017 -u admin -p password

db.users.findOne()
# email и name должны быть Binary(6) если CSFLE включен
```

---

## Secrets Management

### HashiCorp Vault (рекомендуется)

См. [infra/vault/README.md](../infra/vault/README.md)

**Production Vault initialization:**

```bash
# Init (только первый раз!)
vault operator init -key-shares=5 -key-threshold=3

# СОХРАНИТЬ unseal keys и root token в БЕЗОПАСНОМ МЕСТЕ!

# Unseal после каждого рестарта
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# Включить audit logging
vault audit enable file file_path=/vault/logs/audit.log
```

### Kubernetes Secrets

```bash
kubectl create secret generic jwt-secret \
  --from-literal=secret="$(openssl rand -base64 32)" \
  --namespace=trainingground

kubectl create secret generic mongodb-keyfile \
  --from-file=mongo-keyfile=./infra/mongo-keyfile.secure \
  --namespace=trainingground

kubectl create secret generic admin-superuser \
  --from-file=admin-superuser.json=./infra/config/seed/admin-superuser.json \
  --namespace=trainingground
```

---

## Environment Variables

**Production .env.prod template:**

```bash
# Окружение
APP_ENV=prod
NODE_ENV=production

# MongoDB
MONGO_USER=admin
MONGO_PASSWORD=<STRONG_PASSWORD_16+_CHARS>
MONGO_DB=trainingground

# Redis
REDIS_PASSWORD=<STRONG_PASSWORD>

# JWT
JWT_SECRET=<GENERATE_WITH_openssl_rand_base64_32>
JWT_ACCESS_TOKEN_TTL_SECONDS=3600
JWT_REFRESH_TOKEN_TTL_SECONDS=2592000

# Cookie Security (ОБЯЗАТЕЛЬНО true для prod)
COOKIE_SECURE=true
COOKIE_SAME_SITE=Strict

# Rate Limiting
RATE_LIMIT_DISABLED=false
RATE_LIMIT_PER_USER=100
RATE_LIMIT_PER_IP=200
RATE_LIMIT_LOGIN_ATTEMPTS=10
RATE_LIMIT_REGISTER_ATTEMPTS=5

# Vault
VAULT_ADDR=https://vault:8200
VAULT_ROLE_ID=<FROM_init-mongodb-encryption.sh>
VAULT_SECRET_ID=<FROM_init-mongodb-encryption.sh>

# Encryption
MONGODB_ENCRYPTION_ENABLED=true
MONGODB_ENCRYPTION_PROVIDER=vault

# Superuser
ADMIN_SEED_FILE=/secrets/admin-superuser.json
```

---

## Monitoring & Logging

### Prometheus + Grafana

```bash
# Проверка metrics
curl http://localhost:9090/targets
curl -u prometheus:<password> http://localhost:8081/metrics
```

### Alerts

```yaml
# alerts/critical.yml
groups:
  - name: critical
    rules:
      - alert: VaultSealed
        expr: vault_core_unsealed == 0
        labels:
          severity: critical
      - alert: MongoDBDown
        expr: up{job="mongodb"} == 0
        labels:
          severity: critical
```

---

## Backup & Disaster Recovery

### MongoDB Backup

```bash
#!/bin/bash
# infra/scripts/backup-mongodb.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"

# Backup
docker-compose exec -T mongodb-primary mongodump \
  --uri="mongodb://admin:password@localhost:27017/?authSource=admin&replicaSet=rs0" \
  --gzip \
  --archive=/tmp/backup-${DATE}.gz

# Copy из контейнера
docker cp trainingground-mongodb-primary:/tmp/backup-${DATE}.gz ${BACKUP_DIR}/

# Encrypt
openssl enc -aes-256-cbc -salt \
  -in ${BACKUP_DIR}/backup-${DATE}.gz \
  -out ${BACKUP_DIR}/backup-${DATE}.gz.enc \
  -k $(cat /secrets/backup-key)

# Upload to S3
aws s3 cp ${BACKUP_DIR}/backup-${DATE}.gz.enc s3://backups/mongodb/
```

**Cron:**

```bash
# Ежедневно в 02:00
0 2 * * * /opt/trainingground/infra/scripts/backup-mongodb.sh
```

### Restore

```bash
# Decrypt
openssl enc -d -aes-256-cbc \
  -in backup.gz.enc \
  -out backup.gz \
  -k $(cat /secrets/backup-key)

# Restore
docker-compose exec -T mongodb-primary mongorestore \
  --uri="mongodb://admin:password@localhost:27017" \
  --gzip \
  --archive=/tmp/backup.gz \
  --drop
```

---

## Дополнительные ресурсы

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [MongoDB Security Checklist](https://www.mongodb.com/docs/manual/administration/security-checklist/)
- [Vault Production Hardening](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening)

---

**Последнее обновление:** 2025-12-26
**Версия:** 1.0.0
