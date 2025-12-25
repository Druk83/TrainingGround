# MongoDB Security Guide

## Обзор

Этот документ описывает security best practices для MongoDB replica set в проекте TrainingGround, включая authentication, authorization, encryption и keyfile rotation.

## Содержание

1. [Replica Set Authentication](#replica-set-authentication)
2. [Keyfile Management](#keyfile-management)
3. [Keyfile Rotation](#keyfile-rotation)
4. [Access Control](#access-control)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## Replica Set Authentication

MongoDB replica set использует **keyfile authentication** для внутренней аутентификации между членами кластера.

### Требования к keyfile

- **Размер**: 6-1024 байт
- **Формат**: base64 (символы A-Z, a-z, 0-9, +, /)
- **Права доступа**: `chmod 400` (read-only для владельца)
- **Консистентность**: Одинаковый файл на ВСЕХ членах replica set

### Текущая конфигурация

```yaml
# docker-compose.yml
services:
  mongodb-primary:
    volumes:
      - ${MONGO_KEYFILE_PATH:-./infra/mongo-keyfile}:/data/configdb/keyfile:ro
    command: >
      mongod
        --replSet rs0
        --bind_ip_all
        --keyFile /data/configdb/keyfile
        --auth
```

### Переменные окружения

```bash
# .env (development)
MONGO_ROOT_PASSWORD=your-secure-password-here
MONGO_KEYFILE_PATH=./infra/mongo-keyfile

# .env.production
MONGO_ROOT_PASSWORD=${LOCKBOX_MONGO_PASSWORD}
MONGO_KEYFILE_PATH=/run/secrets/mongo-keyfile
```

---

## Keyfile Management

### Генерация нового keyfile

**Локальная разработка**:

```bash
# Использовать скрипт (рекомендуется)
./scripts/generate_mongo_keyfile.sh

# Или вручную
openssl rand -base64 756 > infra/mongo-keyfile
chmod 400 infra/mongo-keyfile
```

**Production**:

```bash
# Использовать Yandex Lockbox
yc lockbox secret create \
  --name mongodb-keyfile-prod \
  --payload "[{key: keyfile, binary_value: $(base64 < infra/mongo-keyfile)}]"
```

### Git Security

**КРИТИЧНО**: Keyfile НЕ ДОЛЖЕН попадать в git!

**.gitignore** (уже настроено):
```gitignore
# MongoDB Replica Set keyfile (CRITICAL SECURITY)
infra/mongo-keyfile
infra/mongodb-keyfile
```

**Example файл** (безопасно для git):
```bash
# infra/mongo-keyfile.example
# MongoDB Replica Set Keyfile Example
#
# SECURITY WARNING: This is an EXAMPLE file. DO NOT use in production!
#
# To generate a secure keyfile for production:
#   openssl rand -base64 756 > infra/mongo-keyfile
```

### Pre-commit Protection

Git hooks проверяют, что keyfile не попал в staging:

```bash
# .githooks/pre-commit-rust (fragment)
if git diff --cached --name-only | grep -E "mongo-keyfile" | grep -v "example"; then
    echo "[ERROR] Attempting to commit MongoDB keyfile!"
    exit 1
fi
```

---

## Keyfile Rotation

### Зачем нужна ротация

1. **Security compliance**: Регулярная смена ключей (каждые 90 дней)
2. **Compromise response**: Немедленная ротация при подозрении на утечку
3. **Team changes**: Ротация при увольнении сотрудника с доступом

### Автоматическая ротация

```bash
./scripts/rotate_mongo_keyfile.sh
```

**Что делает скрипт**:
1. Генерирует новый криптографически стойкий keyfile
2. Копирует на все члены replica set
3. Выполняет **rolling restart** (zero downtime):
   - Сначала secondary члены
   - Затем primary
4. Проверяет здоровье replica set
5. Обновляет локальную копию keyfile

### Ручная ротация (для понимания процесса)

```bash
# 1. Сгенерировать новый keyfile
openssl rand -base64 756 > infra/mongo-keyfile.new
chmod 400 infra/mongo-keyfile.new

# 2. Скопировать на secondary
docker cp infra/mongo-keyfile.new mongodb-secondary:/data/configdb/keyfile.new
docker exec mongodb-secondary chmod 400 /data/configdb/keyfile.new

# 3. Перезапустить secondary
docker exec mongodb-secondary mv /data/configdb/keyfile.new /data/configdb/keyfile
docker compose restart mongodb-secondary

# 4. Дождаться rejoining (проверить rs.status())
docker exec mongodb-primary mongosh --eval "rs.status()"

# 5. Повторить для primary
docker cp infra/mongo-keyfile.new mongodb-primary:/data/configdb/keyfile.new
docker exec mongodb-primary chmod 400 /data/configdb/keyfile.new
docker exec mongodb-primary mv /data/configdb/keyfile.new /data/configdb/keyfile
docker compose restart mongodb-primary

# 6. Обновить локальную копию
mv infra/mongo-keyfile.new infra/mongo-keyfile
```

### Проверка после ротации

```bash
# 1. Replica set status
docker exec mongodb-primary mongosh --eval "rs.status()"

# 2. Rust API подключение
docker compose logs rust-api | grep "MongoDB connection established"

# 3. Admin console доступность
curl -H "Authorization: Bearer $JWT_TOKEN" http://localhost:3000/api/admin/templates
```

---

## Access Control

### Role-Based Access Control (RBAC)

MongoDB использует RBAC для управления доступом пользователей.

**Root admin** (создается при инициализации):
```javascript
{
  user: "admin",
  pwd: "<MONGO_ROOT_PASSWORD>",
  roles: [
    { role: "root", db: "admin" }
  ]
}
```

**Application user** (создается через init скрипты):
```javascript
{
  user: "trainingground-app",
  pwd: "<APP_PASSWORD>",
  roles: [
    { role: "readWrite", db: "trainingground" },
    { role: "read", db: "admin" }  // для monitoring
  ]
}
```

### Connection String Security

**Development**:
```bash
MONGO_URI=mongodb://admin:password@mongodb-primary:27017,mongodb-secondary:27017/trainingground?replicaSet=rs0&authSource=admin
```

**Production** (с TLS):
```bash
MONGO_URI=mongodb://app-user:${LOCKBOX_APP_PASSWORD}@mongo-0.cluster.local:27017,mongo-1.cluster.local:27017,mongo-2.cluster.local:27017/trainingground?replicaSet=rs0&authSource=admin&tls=true&tlsCAFile=/etc/ssl/certs/ca.pem
```

---

## Production Deployment

### Yandex Cloud Integration

**1. Создать secrets в Lockbox**:

```bash
# MongoDB root password
yc lockbox secret create \
  --name mongo-root-password \
  --payload "[{key: password, text_value: $(openssl rand -base64 32)}]"

# MongoDB keyfile
yc lockbox secret create \
  --name mongodb-keyfile-prod \
  --payload "[{key: keyfile, binary_value: $(openssl rand -base64 756 | base64)}]"

# Application password
yc lockbox secret create \
  --name mongo-app-password \
  --payload "[{key: password, text_value: $(openssl rand -base64 32)}]"
```

**2. Настроить Docker Compose для production**:

```yaml
services:
  mongodb-primary:
    secrets:
      - mongo_keyfile
      - mongo_root_password
    environment:
      MONGO_INITDB_ROOT_PASSWORD_FILE: /run/secrets/mongo_root_password
    command: >
      mongod
        --replSet rs0
        --bind_ip_all
        --keyFile /run/secrets/mongo_keyfile
        --auth
        --tlsMode requireTLS
        --tlsCertificateKeyFile /etc/ssl/mongodb/server.pem
        --tlsCAFile /etc/ssl/mongodb/ca.pem

secrets:
  mongo_keyfile:
    external: true
  mongo_root_password:
    external: true
```

**3. TLS/SSL Configuration**:

```bash
# Generate self-signed certificate for development
openssl req -newkey rsa:2048 -nodes -keyout infra/ssl/mongodb-key.pem \
  -x509 -days 365 -out infra/ssl/mongodb-cert.pem

# Combine for MongoDB
cat infra/ssl/mongodb-cert.pem infra/ssl/mongodb-key.pem > infra/ssl/mongodb.pem
chmod 400 infra/ssl/mongodb.pem
```

### Encryption at Rest

**MongoDB Enterprise** (рекомендуется для production):

```yaml
# docker-compose.production.yml
services:
  mongodb-primary:
    image: mongodb/mongodb-enterprise:7.0
    command: >
      mongod
        --replSet rs0
        --enableEncryption
        --encryptionKeyFile /run/secrets/encryption_key
        --encryptionCipherMode AES256-CBC
```

**Community Edition** (альтернатива - filesystem encryption):
- Использовать LUKS для шифрования volumes
- Настроить encrypted EBS volumes в Yandex Cloud

---

## Troubleshooting

### Проблема: "Authentication failed" после ротации

**Симптомы**:
```
MongoServerError: Authentication failed
```

**Причина**: Keyfile различается на разных членах replica set

**Решение**:
```bash
# Проверить keyfile на всех членах
docker exec mongodb-primary md5sum /data/configdb/keyfile
docker exec mongodb-secondary md5sum /data/configdb/keyfile

# Должны быть идентичными! Если нет:
docker cp infra/mongo-keyfile mongodb-secondary:/data/configdb/keyfile
docker exec mongodb-secondary chmod 400 /data/configdb/keyfile
docker compose restart mongodb-secondary
```

### Проблема: "Permissions are too open"

**Симптомы**:
```
permissions on /data/configdb/keyfile are too open
```

**Причина**: Keyfile должен иметь права доступа 400 (read-only для owner)

**Решение**:
```bash
# В контейнере
docker exec mongodb-primary chmod 400 /data/configdb/keyfile

# Локально
chmod 400 infra/mongo-keyfile
```

### Проблема: Replica set unhealthy после ротации

**Симптомы**:
```
rs.status() показывает STARTUP или RECOVERING
```

**Причина**: Слишком быстрый restart, не дали времени на синхронизацию

**Решение**:
```bash
# Подождать 30 секунд
sleep 30

# Проверить статус
docker exec mongodb-primary mongosh --eval "rs.status()"

# Если primary не избран, можно форсировать:
docker exec mongodb-primary mongosh --eval "rs.stepDown()"
```

### Проблема: Keyfile в git history

**Симптомы**: Secret scanning tools (GitHub, GitGuardian) детектируют keyfile

**Решение**:
```bash
# 1. Немедленно сменить keyfile
./scripts/rotate_mongo_keyfile.sh

# 2. Удалить из git history
./scripts/git_remove_keyfile_history.sh

# 3. Force push
git push origin --force --all

# 4. Уведомить команду re-clone
```

---

## Security Checklist

### Development Environment

- [ ] `infra/mongo-keyfile` в `.gitignore`
- [ ] `infra/mongo-keyfile.example` существует и содержит инструкции
- [ ] Keyfile имеет права доступа 400
- [ ] Pre-commit hook проверяет staging на наличие keyfile
- [ ] `.env` не коммитится (в `.gitignore`)
- [ ] MongoDB root password не в plaintext (в `.env`)

### Production Environment

- [ ] Keyfile хранится в Yandex Lockbox (не в файловой системе)
- [ ] TLS/SSL включен для всех MongoDB подключений
- [ ] Encryption at Rest включено
- [ ] Audit logging включен (`--auditDestination`)
- [ ] Network isolation (firewall разрешает только internal IPs)
- [ ] Regular backups настроены и тестируются
- [ ] Keyfile ротация автоматизирована (каждые 90 дней)
- [ ] Monitoring и alerting на authentication failures

### CI/CD Pipeline

- [ ] Secret scanning включен (GitHub Advanced Security, GitGuardian)
- [ ] Pre-commit hooks установлены на всех dev машинах
- [ ] CI проверяет отсутствие secrets в коммитах
- [ ] Deployment требует approval для production secrets

---

## References

**MongoDB Documentation**:
- [Deploy Replica Set With Keyfile Authentication](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/)
- [Keyfile Security](https://www.mongodb.com/docs/manual/core/security-internal-authentication/)
- [Rotate Keys](https://www.mongodb.com/docs/manual/tutorial/rotate-encryption-key/)
- [Encryption at Rest](https://www.mongodb.com/docs/manual/core/security-encryption-at-rest/)

**Yandex Cloud**:
- [Lockbox](https://cloud.yandex.ru/docs/lockbox/)
- [Managed MongoDB](https://cloud.yandex.ru/docs/managed-mongodb/)

**Security Best Practices**:
- [OWASP Database Security](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html)
- [CIS MongoDB Benchmark](https://www.cisecurity.org/benchmark/mongodb)

---

## Changelog

- **2025-12-25**: Создан документ как часть TD-07 (MongoDB Keyfile Security & Rotation)
- **Source**: Based on A6 implementation and production deployment requirements
