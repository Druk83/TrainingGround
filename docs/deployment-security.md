# Безопасный деплой супер-пользователя

Процесс создания главной учетной записи при деплое с соблюдением мер безопасности.

## Принципы безопасности

1. Секретный файл `admin-superuser.json` исключен из git через `.gitignore`
2. Пароли хешируются bcrypt (cost=12) перед сохранением в БД
3. Супер-пользователь создается один раз при первом запуске (`$setOnInsert`)
4. Реальный файл хранится только в секретном хранилище (Vault, K8s Secrets, AWS Secrets Manager)

---

## Генерация секретного файла

```bash
python3 scripts/generate_superuser_secret.py \
  --email admin@yourcompany.com \
  --name "Platform Admin" \
  --groups admin
```

Скрипт создаст файл `infra/config/seed/admin-superuser.json` с рандомным паролем (24 символа).

**ВАЖНО:** Сохраните выведенный пароль в защищённый менеджер паролей. Файл НЕ коммитить в git.

---

## Структура файла

```json
{
  "email": "admin@example.com",
  "name": "Admin Name",
  "role": "admin",
  "group_ids": ["admin"],
  "password": "SECURE_RANDOM_PASSWORD_HERE",
  "metadata": {
    "note": "Password will be hashed with bcrypt before storage"
  }
}
```

Обязательные поля: `email`, `password`, `role` (должен быть "admin").

---

## Хранение секретов

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: admin-superuser-seed
type: Opaque
stringData:
  admin-superuser.json: |
    {"email": "...", "password": "...", "role": "admin", "group_ids": ["admin"]}
```

Монтирование:

```yaml
env:
- name: ADMIN_SEED_FILE
  value: /secrets/admin-superuser.json
volumeMounts:
- name: admin-seed
  mountPath: /secrets
  readOnly: true
volumes:
- name: admin-seed
  secret:
    secretName: admin-superuser-seed
```

### AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name trainingground/admin-superuser \
  --secret-string file://admin-superuser.json
```

### HashiCorp Vault

```bash
vault kv put secret/trainingground/admin @admin-superuser.json
vault kv get -format=json secret/trainingground/admin > /tmp/seed.json
export ADMIN_SEED_FILE=/tmp/seed.json
```

---

## Локальная разработка

```bash
# 1. Генерация (один раз)
python3 scripts/generate_superuser_secret.py \
  --email dev@localhost \
  --output infra/config/seed/admin-superuser.json

# 2. Запуск API с bootstrap
ADMIN_SEED_FILE=infra/config/seed/admin-superuser.json \
  cargo run --bin trainingground-api
```

Логи подтвердят: `"Bootstrapping superuser with email dev@localhost"`

---

## Production деплой

### Docker

```yaml
# docker-compose.yml
services:
  api:
    environment:
      - ADMIN_SEED_FILE=/run/secrets/admin-superuser
    secrets:
      - admin-superuser

secrets:
  admin-superuser:
    external: true  # В production через docker secret create
```

### CI/CD

```yaml
# .github/workflows/deploy.yml
- name: Bootstrap superuser
  env:
    SEED_JSON: ${{ secrets.ADMIN_SUPERUSER_SEED }}
  run: |
    echo "$SEED_JSON" > /tmp/seed.json
    export ADMIN_SEED_FILE=/tmp/seed.json
    ./deploy.sh
    rm /tmp/seed.json
```

---

## Чек-лист перед production

- [ ] `.gitignore` содержит `admin-superuser.json`
- [ ] Example файл НЕ используется для деплоя
- [ ] Секретный файл в Vault/Secrets Manager
- [ ] Пароль ≥16 символов
- [ ] `JWT_SECRET` уникальный для production
- [ ] MongoDB защищена паролем
- [ ] HTTPS включен

---

## При утечке секретов

1. Удалить файл из git истории (BFG Repo-Cleaner)
2. Сменить пароль через MongoDB:
   ```javascript
   db.users.updateOne(
     { email: "admin@example.com" },
     { $set: { password_hash: "<new_bcrypt_hash>" } }
   )
   ```
3. Ротировать `JWT_SECRET`
4. Проверить `audit_log` на подозрительные действия
