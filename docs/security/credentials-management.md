# Управление секретами

## Обязательные переменные

- `MONGO_USER` / `MONGO_PASSWORD` - MongoDB credentials
- `REDIS_PASSWORD` - Redis auth
- `QDRANT_API_KEY` - Qdrant API key
- `JWT_SECRET` - JWT signing key (64+ hex chars)
- `GRAFANA_PASSWORD` - Grafana admin password

## Быстрый старт

### Генерация секретов

**Linux/macOS:**
```bash
bash infra/scripts/generate_secrets.sh
```

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/generate_secrets.ps1
```

### Проверка

**Linux/macOS/Git Bash:**
```bash
bash infra/scripts/check_env.sh
```

**Windows CMD:**
```cmd
infra\scripts\check_env.cmd
```

## Требования

- Production: минимум 20 символов, случайные
- JWT Secret: 128 символов (64 bytes hex)
- Не использовать: `password`, `changeme`, `admin`, словарные слова

## Production хранение

- Yandex Lockbox (рекомендуется для Yandex Cloud)
- HashiCorp Vault
- Kubernetes Secrets

## Ротация

- JWT: каждые 90 дней
- Пароли БД: каждые 180 дней
- При компрометации: немедленно

## Ротация JWT

```bash
bash infra/scripts/rotate_jwt_secret.sh
```

Скрипт поддерживает старый ключ 24 часа (grace period).

## Troubleshooting

Ошибка "MONGO_PASSWORD must be set":
```bash
bash infra/scripts/generate_secrets.sh
```

Проверить weak passwords:
```bash
bash infra/scripts/check_env.sh
# или в Windows CMD:
infra\scripts\check_env.cmd
```
