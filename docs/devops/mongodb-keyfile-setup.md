# MongoDB Keyfile Management - DevOps Guide

## Обзор

MongoDB Replica Set использует **keyfile authentication** для внутренней аутентификации между членами кластера. Этот документ содержит практические инструкции по настройке, генерации и ротации keyfile.

---

## 1. Первоначальная настройка

### 1.1. Генерация keyfile для development

**Windows (PowerShell):**

```powershell
# Запустить скрипт генерации
.\scripts\generate_mongo_keyfile.ps1

# Вывод:
# [INFO] MongoDB Keyfile Generator
# [INFO] Generating new MongoDB keyfile (756 bytes)...
# [OK] MongoDB keyfile generated at: B:\MishaGame\infra\mongo-keyfile.secure
# File created successfully:
#   Path: B:\MishaGame\infra\mongo-keyfile.secure
#   Size: 1008 bytes
```

**Linux/Mac (Bash):**

```bash
# Запустить скрипт генерации
./scripts/generate_mongo_keyfile.sh

# Или вручную через OpenSSL
openssl rand -base64 756 > infra/mongo-keyfile.secure
chmod 400 infra/mongo-keyfile.secure
```

**Вручную через Python (кроссплатформенно):**

```bash
python -c "import os, base64; open('infra/mongo-keyfile.secure', 'w').write(base64.b64encode(os.urandom(756)).decode('ascii'))"
```

### 1.2. Проверка корректности keyfile

```bash
# Проверить размер (должно быть ~1008 байт)
ls -lh infra/mongo-keyfile.secure

# Проверить формат (должен быть base64)
head -c 100 infra/mongo-keyfile.secure
# Вывод: DCTtBNuHaubS+8JxfaeFLmwhJJBUBX1p4sVbDyNQQrEYR+kbrIwWXiiQ...

# Проверить, что файл НЕ в git
git check-ignore infra/mongo-keyfile.secure
# Вывод: .gitignore:99:infra/mongo-keyfile.secure
```

### 1.3. Запуск MongoDB с keyfile

```bash
# Запустить MongoDB контейнеры
docker compose up -d mongodb-primary mongodb-secondary1 mongodb-secondary2

# Подождать пока контейнеры станут healthy (20-30 секунд)
docker compose ps mongodb-primary mongodb-secondary1 mongodb-secondary2

# Проверить, что keyfile authentication активен
docker exec trainingground-mongodb-primary mongosh --quiet --eval "db.adminCommand('ping')"
```

**Ожидаемый вывод** (наличие `$clusterTime.signature` подтверждает использование keyfile):

```json
{
  ok: 1,
  '$clusterTime': {
    clusterTime: Timestamp({ t: 1766662006, i: 1 }),
    signature: {
      hash: Binary.createFromBase64('a7WcQL0I5ajEtqNGjLi5KRf4f4I=', 0),
      keyId: Long('7586670131900579845')
    }
  }
}
```

---

## 2. Настройка переменных окружения

### 2.1. Локальная разработка (.env)

Создайте файл `.env` (НЕ коммитить в git!):

```bash
# MongoDB configuration
MONGO_USER=admin
MONGO_PASSWORD=your-secure-password-here
MONGO_DB=trainingground

# MongoDB keyfile path (относительный путь от docker-compose.yml)
MONGO_KEYFILE_PATH=./infra/mongo-keyfile.secure
```

### 2.2. Production (.env.production)

```bash
# MongoDB configuration
MONGO_USER=admin
MONGO_PASSWORD=${LOCKBOX_MONGO_PASSWORD}  # Из Yandex Lockbox
MONGO_DB=trainingground

# Production keyfile (монтируется из Docker Secrets)
MONGO_KEYFILE_PATH=/run/secrets/mongo-keyfile
```

---

## 3. Ротация keyfile (каждые 90 дней)

### 3.1. Автоматическая ротация (Zero Downtime)

**Windows:**

```powershell
# Запустить скрипт ротации
.\scripts\rotate_mongo_keyfile.ps1

# Скрипт выполнит:
# [STEP 1/5] Генерирует новый keyfile
# [STEP 2/5] Проверяет что MongoDB запущен
# [STEP 3/5] Копирует keyfile на все ноды
# [STEP 4/5] Rolling restart (secondary → primary)
# [STEP 5/5] Обновляет локальный keyfile
# [OK] MongoDB keyfile rotation completed successfully
```

**Linux/Mac:**

```bash
./scripts/rotate_mongo_keyfile.sh
```

### 3.2. Ручная ротация (для понимания процесса)

```bash
# 1. Сгенерировать новый keyfile
openssl rand -base64 756 > infra/mongo-keyfile.new
chmod 400 infra/mongo-keyfile.new

# 2. Скопировать на secondary ноды
docker cp infra/mongo-keyfile.new trainingground-mongodb-secondary1:/data/keyfile/mongo-keyfile.new
docker cp infra/mongo-keyfile.new trainingground-mongodb-secondary2:/data/keyfile/mongo-keyfile.new

# Установить права
docker exec trainingground-mongodb-secondary1 chmod 400 /data/keyfile/mongo-keyfile.new
docker exec trainingground-mongodb-secondary2 chmod 400 /data/keyfile/mongo-keyfile.new

# 3. Перезапустить secondary ноды (по одной)
docker exec trainingground-mongodb-secondary1 mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
docker compose restart mongodb-secondary1
sleep 10  # Дождаться rejoin

docker exec trainingground-mongodb-secondary2 mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
docker compose restart mongodb-secondary2
sleep 10

# 4. Проверить replica set
docker exec trainingground-mongodb-primary mongosh --eval "rs.status()"

# 5. Перезапустить primary
docker cp infra/mongo-keyfile.new trainingground-mongodb-primary:/data/keyfile/mongo-keyfile.new
docker exec trainingground-mongodb-primary chmod 400 /data/keyfile/mongo-keyfile.new
docker exec trainingground-mongodb-primary mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
docker compose restart mongodb-primary

# 6. Обновить локальный файл
mv infra/mongo-keyfile.new infra/mongo-keyfile.secure
```

### 3.3. Проверка после ротации

```bash
# 1. Проверить статус replica set
docker exec trainingground-mongodb-primary mongosh --eval "rs.status().ok"
# Вывод: 1 (OK)

# 2. Проверить подключение Rust API
docker compose logs --tail=10 rust-api | grep -i mongodb
# Вывод: [INFO] MongoDB connected

# 3. Проверить Admin Console
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/api/admin/templates
# Должен вернуть список шаблонов (не ошибку аутентификации)
```

---

## 4. Production Deployment (Yandex Cloud)

### 4.1. Создание secrets в Yandex Lockbox

```bash
# 1. Сгенерировать production keyfile
openssl rand -base64 756 > mongo-keyfile.production

# 2. Создать secret в Lockbox
yc lockbox secret create \
  --name mongodb-keyfile-prod \
  --payload "[{key: keyfile, binary_value: $(base64 < mongo-keyfile.production)}]"

# Вывод:
# id: e6q9...
# folder_id: b1g...
# created_at: "2025-12-25T11:30:00Z"
# name: mongodb-keyfile-prod
# status: ACTIVE

# 3. ВАЖНО: Удалить локальный файл после загрузки
shred -u mongo-keyfile.production  # Linux
# или
sdelete -p 3 mongo-keyfile.production  # Windows
```

### 4.2. Настройка Docker Secrets

**docker-compose.production.yml:**

```yaml
services:
  mongodb-primary:
    secrets:
      - mongo_keyfile
    volumes:
      # НЕ монтировать keyfile из файловой системы!
      - mongodb_primary_data:/data/db
    command: >
      bash -c "
        chmod 400 /run/secrets/mongo_keyfile &&
        chown mongodb:mongodb /run/secrets/mongo_keyfile &&
        exec docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile /run/secrets/mongo_keyfile
      "

secrets:
  mongo_keyfile:
    external: true
    name: mongodb-keyfile-prod
```

### 4.3. Создание Docker Secret из Lockbox

```bash
# 1. Получить keyfile из Lockbox
yc lockbox payload get \
  --name mongodb-keyfile-prod \
  --key keyfile \
  --binary-output mongo-keyfile.temp

# 2. Создать Docker secret
echo "$(cat mongo-keyfile.temp)" | docker secret create mongodb-keyfile-prod -

# 3. Удалить временный файл
shred -u mongo-keyfile.temp

# 4. Проверить secret
docker secret ls
# Вывод:
# ID          NAME                    CREATED         UPDATED
# abc123...   mongodb-keyfile-prod    5 seconds ago   5 seconds ago
```

### 4.4. Автоматическая ротация в production (каждые 90 дней)

**Создать cron job на production сервере:**

```bash
# Открыть crontab
crontab -e

# Добавить задачу (ротация каждые 90 дней в 3:00 AM)
0 3 */90 * * /opt/trainingground/scripts/rotate_mongo_keyfile_production.sh >> /var/log/mongo-keyfile-rotation.log 2>&1
```

**scripts/rotate_mongo_keyfile_production.sh:**

```bash
#!/bin/bash
set -euo pipefail

# 1. Сгенерировать новый keyfile
openssl rand -base64 756 > /tmp/mongo-keyfile.new

# 2. Обновить Lockbox
yc lockbox secret update \
  --name mongodb-keyfile-prod \
  --payload "[{key: keyfile, binary_value: $(base64 < /tmp/mongo-keyfile.new)}]"

# 3. Обновить Docker secret
docker secret rm mongodb-keyfile-prod || true
cat /tmp/mongo-keyfile.new | docker secret create mongodb-keyfile-prod -

# 4. Rolling restart (через docker stack)
docker service update --force mongodb-primary
sleep 30
docker service update --force mongodb-secondary1
sleep 30
docker service update --force mongodb-secondary2

# 5. Cleanup
shred -u /tmp/mongo-keyfile.new

echo "[$(date)] MongoDB keyfile rotation completed successfully"
```

---

## 5. Troubleshooting

### 5.1. Ошибка: "permissions on keyfile are too open"

**Проблема:**
```
Read security file failed: permissions on /data/keyfile/mongo-keyfile are too open
```

**Решение:**
```bash
# Внутри контейнера права должны быть 400
docker exec trainingground-mongodb-primary ls -l /data/keyfile/mongo-keyfile
# -r-------- 1 mongodb mongodb 1008 Dec 25 11:00 /data/keyfile/mongo-keyfile

# Если права неправильные, контейнер автоматически исправит их при старте
# (см. docker-compose.yml, команда chmod 400)
```

### 5.2. Ошибка: "Unable to acquire security key[s]"

**Проблема:**
```
Error creating service context: Location5579201: Unable to acquire security key[s]
```

**Причина:** Keyfile не найден или имеет неправильный формат

**Решение:**
```bash
# 1. Проверить что файл существует
ls -lh infra/mongo-keyfile.secure

# 2. Проверить формат (должен быть base64)
head -c 100 infra/mongo-keyfile.secure
# Должен содержать только символы A-Z, a-z, 0-9, +, /

# 3. Проверить размер (6-1024 байт)
wc -c infra/mongo-keyfile.secure
# Вывод: 1008 infra/mongo-keyfile.secure

# 4. Пересоздать keyfile
python -c "import os, base64; open('infra/mongo-keyfile.secure', 'w').write(base64.b64encode(os.urandom(756)).decode('ascii'))"

# 5. Перезапустить контейнеры
docker compose restart mongodb-primary mongodb-secondary1 mongodb-secondary2
```

### 5.3. Ошибка: Replica set unhealthy после ротации

**Проблема:**
```
rs.status() показывает STARTUP или RECOVERING
```

**Решение:**
```bash
# 1. Проверить, что keyfile одинаковый на всех нодах
docker exec trainingground-mongodb-primary md5sum /data/keyfile/mongo-keyfile
docker exec trainingground-mongodb-secondary1 md5sum /data/keyfile/mongo-keyfile
docker exec trainingground-mongodb-secondary2 md5sum /data/keyfile/mongo-keyfile

# MD5 суммы ДОЛЖНЫ совпадать!

# 2. Если не совпадают, скопировать keyfile заново
docker cp infra/mongo-keyfile.secure trainingground-mongodb-secondary1:/data/keyfile/mongo-keyfile
docker exec trainingground-mongodb-secondary1 chmod 400 /data/keyfile/mongo-keyfile
docker compose restart mongodb-secondary1

# 3. Подождать 30-60 секунд и проверить
docker exec trainingground-mongodb-primary mongosh --eval "rs.status()"
```

### 5.4. Keyfile случайно попал в git

**КРИТИЧНАЯ СИТУАЦИЯ!**

```bash
# 1. Немедленно прекратить коммит
git reset HEAD infra/mongo-keyfile.secure

# 2. Убедиться что файл в .gitignore
grep "mongo-keyfile.secure" .gitignore
# Вывод: infra/mongo-keyfile.secure

# 3. Если файл уже в git history - запустить очистку
./scripts/git_remove_keyfile_history.sh

# ВНИМАНИЕ: Это переписывает git history!
# После выполнения:
git push origin --force --all

# 4. Немедленно выполнить ротацию keyfile
./scripts/rotate_mongo_keyfile.ps1

# 5. Считать старый keyfile скомпрометированным
```

---

## 6. Security Checklist

### Development Environment

- [x] `infra/mongo-keyfile.secure` в `.gitignore`
- [x] `infra/mongo-keyfile.example` существует (безопасный шаблон)
- [x] Pre-commit hook проверяет staging
- [x] Keyfile генерируется криптографически случайно
- [x] Размер keyfile = 1008 байт (756 байт → base64)
- [x] `.env` файл не коммитится

### Production Environment

- [x] Keyfile хранится в Yandex Lockbox (не в git)
- [x] Docker Secrets используются для монтирования
- [x] TLS/SSL включен для MongoDB connections
- [x] Автоматическая ротация каждые 90 дней (cron)
- [x] Audit logging включен
- [x] Network isolation (firewall)
- [x] Regular backups тестируются
- [x] Monitoring alerting на authentication failures

---

## 7. Примеры keyfile (безопасные)

### 7.1. Корректный формат keyfile

```
# ПРИМЕР (НЕ использовать в production!)
DCTtBNuHaubS+8JxfaeFLmwhJJBUBX1p4sVbDyNQQrEYR+kbrIwWXiiQJtnS2ZBteMkjDOqRHxCs
ftKiyN0g8+fxN/Zq9Sxkk0CpAZ3vN2qR1mT4uB7wE9xF0pC5dG6hI3jK8lL2mM1nN4oO9pP0qQ7r
R8sS3tT4uU5vV6wW7xX8yY9zA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR
... (продолжение base64 строки до 1008 символов)
```

### 7.2. Некорректные форматы (примеры ошибок)

**Слишком короткий:**
```
# ОШИБКА: Меньше 6 байт
aGVsbG8=
```

**Неправильный формат:**
```
# ОШИБКА: Содержит недопустимые символы
hello-world-key-2024!@#$%
```

**Plain text:**
```
# ОШИБКА: Не в base64
trainingground-dev-key-please-change-in-production
```

---

## 8. Связанные документы

- [MongoDB Security Guide](../mongodb-security.md) - Полное руководство по безопасности MongoDB
- [Deployment Security](../deployment-security.md) - Общие практики безопасного деплоя
- [TD-07: MongoDB Keyfile Security](../../tasks/TD-07.md) - Техническое задание
- [Scripts README](../../scripts/README.md) - Документация всех скриптов

---

## 9. FAQ

**Q: Как часто нужно менять keyfile?**
A: Рекомендуется каждые 90 дней (security compliance). Также при подозрении на утечку или увольнении сотрудника с доступом.

**Q: Можно ли использовать один keyfile на dev и production?**
A: НЕТ! Каждая среда (dev, staging, production) должна иметь уникальный keyfile.

**Q: Что делать если потерял keyfile?**
A: Если MongoDB работает - можно извлечь keyfile из контейнера. Если MongoDB не запускается - нужно пересоздать replica set с новым keyfile (потребуется re-sync данных).

**Q: Почему keyfile должен быть одинаковым на всех нодах?**
A: MongoDB использует keyfile для взаимной аутентификации между членами replica set. Разные keyfile = члены не смогут аутентифицироваться друг с другом.

**Q: Можно ли хранить keyfile в environment variable?**
A: Технически да, но это плохая практика. Используйте file-based secrets (Docker Secrets, Kubernetes Secrets) или secret managers (Yandex Lockbox, HashiCorp Vault).

**Q: Нужно ли шифровать keyfile при хранении?**
A: Сам keyfile уже является криптографическим материалом. При хранении в Lockbox/Vault он автоматически шифруется. При хранении на диске - установите права 400 (read-only для owner).

---

**Последнее обновление**: 2025-12-25
**Версия документа**: 1.0
**Автор**: TrainingGround DevOps Team
