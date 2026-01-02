# MongoDB Encryption at Rest с HashiCorp Vault

Документация по настройке Client-Side Field Level Encryption (CSFLE) для защиты PII данных в MongoDB.

## Обзор

**Стратегия шифрования:**
- **Application-Level Encryption (CSFLE)** для чувствительных полей (email, name, IP)
- **HashiCorp Vault** для централизованного управления ключами шифрования
- **Автоматическая ротация ключей** каждые 90 дней
- **Filesystem-Level Encryption** для production deployments (опционально)

**Алгоритмы шифрования:**
- `AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic` для индексируемых полей (email)
- `AEAD_AES_256_CBC_HMAC_SHA_512-Random` для остальных PII полей

## Быстрый старт (Development)

### 1. Запуск Vault

```bash
# Запустить Vault в dev режиме
docker-compose up -d vault

# Проверить статус
docker-compose logs vault

# Vault UI доступен по адресу: http://localhost:8200
# Root Token: dev-root-token (из .env)
```

### 2. Инициализация ключей шифрования

```bash
# Сделать скрипт исполняемым
chmod +x infra/vault/init-mongodb-encryption.sh

# Запустить инициализацию
./infra/vault/init-mongodb-encryption.sh

# Скрипт создаст:
# - Master key для Key Encryption Key (KEK)
# - Data Encryption Keys для каждого PII поля
# - AppRole для аутентификации приложения
# - Политики доступа
```

### 3. Обновление .env файла

После успешной инициализации скрипт выведет `VAULT_ROLE_ID` и `VAULT_SECRET_ID`. Добавьте их в `.env`:

```bash
# HashiCorp Vault
VAULT_ADDR=http://localhost:8200
VAULT_ROOT_TOKEN=dev-root-token
VAULT_ROLE_ID=<output_from_script>
VAULT_SECRET_ID=<output_from_script>

# MongoDB Encryption
MONGODB_ENCRYPTION_ENABLED=true
MONGODB_ENCRYPTION_PROVIDER=vault
```

### 4. Перезапуск приложения

```bash
docker-compose restart rust-api
```

## Архитектура

```
┌─────────────────┐
│   Rust API      │
│                 │
│  ┌──────────┐   │         ┌──────────────────┐
│  │ CSFLE    │◄──┼────────►│  Vault Server    │
│  │ Driver   │   │         │                  │
│  └──────────┘   │         │  ┌────────────┐  │
│       ▲         │         │  │ Master Key │  │
│       │         │         │  ├────────────┤  │
│       ▼         │         │  │ DEK: email │  │
└───────┼─────────┘         │  │ DEK: name  │  │
        │                   │  │ DEK: ip    │  │
        │ Encrypted         │  └────────────┘  │
        │ Data              │                  │
        ▼                   └──────────────────┘
┌─────────────────┐
│  MongoDB        │
│  Replica Set    │
│                 │
│  ┌───────────┐  │
│  │ Encrypted │  │  ← Данные хранятся зашифрованными
│  │   Data    │  │
│  └───────────┘  │
└─────────────────┘
```

## Шифруемые поля

### Коллекция `users`
- `email` (Deterministic) - для поддержки поиска по email
- `name` (Random)

### Коллекция `audit_log`
- `ip_address` (Random)
- `user_agent` (Random)

## Ротация ключей

### Автоматическая ротация (Production)

Настроить cron job для автоматической ротации каждые 90 дней:

```bash
# Скопировать crontab
sudo cp infra/vault/crontab-key-rotation /etc/cron.d/mongodb-encryption

# Или установить вручную
sudo crontab -e

# Добавить:
0 2 1 1,4,7,10 * /opt/trainingground/infra/vault/rotate-encryption-keys.sh
```

### Ручная ротация

```bash
# Убедитесь что VAULT_TOKEN установлен
export VAULT_TOKEN=<your-root-token>

# Запустить ротацию
./infra/vault/rotate-encryption-keys.sh
```

**Важно:** После ротации ключей:
- Старые данные остаются расшифровываемыми (Vault хранит последние 3 версии ключей)
- Новые данные шифруются новыми ключами
- Для re-encryption старых данных см. секцию "Re-encryption"

## Re-encryption старых данных

После ротации ключей рекомендуется перешифровать старые данные:

```bash
# Dry run (проверка без изменений)
DRY_RUN=true ./infra/vault/reencrypt-old-data.sh

# Реальная re-encryption
VAULT_TOKEN=<your-token> ./infra/vault/reencrypt-old-data.sh

# С custom параметрами
BATCH_SIZE=50 MONGO_URI=mongodb://... ./infra/vault/reencrypt-old-data.sh
```

Скрипт выполняет:
1. Проверку подключения к MongoDB и Vault
2. Чтение старых данных (расшифровка старым ключом)
3. Запись обратно (шифрование новым ключом)
4. Обработку порциями для снижения нагрузки
5. Верификацию успешности re-encryption

## Production Setup

### 1. Vault High Availability

В production НЕ используйте dev режим Vault. Настройте HA конфигурацию:

```yaml
# docker-compose.prod.yml
vault:
  image: hashicorp/vault:1.15
  environment:
    VAULT_LOCAL_CONFIG: |
      storage "consul" {
        address = "consul:8500"
        path    = "vault/"
      }
      listener "tcp" {
        address     = "0.0.0.0:8200"
        tls_cert_file = "/vault/tls/cert.pem"
        tls_key_file  = "/vault/tls/key.pem"
      }
      api_addr = "https://vault.example.com:8200"
      cluster_addr = "https://vault-node1:8201"
      ui = true
  command: server
```

### 2. TLS для Vault

```bash
# Генерация самоподписанного сертификата (для тестирования)
openssl req -x509 -newkey rsa:4096 -keyout vault-key.pem -out vault-cert.pem -days 365 -nodes

# В production использовать Let's Encrypt или корпоративный CA
```

### 3. Filesystem Encryption (опционально)

Для дополнительной защиты (defense in depth) настроить LUKS для MongoDB volumes:

```bash
# Создать encrypted volume
sudo cryptsetup luksFormat /dev/sdb1
sudo cryptsetup luksOpen /dev/sdb1 mongodb-encrypted

# Создать файловую систему
sudo mkfs.ext4 /dev/mapper/mongodb-encrypted

# Монтировать
sudo mount /dev/mapper/mongodb-encrypted /data/mongodb

# Хранить LUKS ключ в Vault
vault kv put secret/mongodb/luks-key key="$(cat /root/luks-key)"
```

### 4. AWS KMS (альтернатива Vault)

Для AWS deployments можно использовать AWS KMS:

```yaml
# .env
MONGODB_ENCRYPTION_PROVIDER=aws-kms
AWS_KMS_CMK_ARN=arn:aws:kms:us-east-1:123456789:key/...
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
```

## Мониторинг и аудит

### Логи

```bash
# Аудит логи операций с ключами
tail -f /var/log/mongodb/encryption-audit.log

# Логи ротации ключей
tail -f /var/log/mongodb/key-rotation.log

# Vault audit logs
docker-compose exec vault vault audit enable file file_path=/vault/logs/audit.log
```

### Метрики Prometheus

Vault экспортирует метрики для Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'vault'
    static_configs:
      - targets: ['vault:8200']
    metrics_path: '/v1/sys/metrics'
    params:
      format: ['prometheus']
```

### Алерты

```yaml
# alerts/vault.yml
groups:
  - name: vault
    rules:
      - alert: VaultSealed
        expr: vault_core_unsealed == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Vault is sealed"

      - alert: KeyRotationDue
        expr: days_until_rotation < 7
        labels:
          severity: warning
        annotations:
          summary: "Key rotation due in {{ $value }} days"
```

## Безопасность

### Best Practices

1. **Никогда не коммитить ключи в Git**
   - Использовать `.gitignore` для `/infra/vault/*.key`, `/secrets/`
   - Добавить pre-commit hook для проверки

2. **Разделение обязанностей**
   - Dev: VAULT_ROOT_TOKEN в .env (только для локальной разработки)
   - Staging/Prod: AppRole authentication без root token

3. **Ротация ключей**
   - Автоматическая ротация каждые 90 дней
   - Уведомление за 7 дней до истечения
   - Мониторинг успешности ротации

4. **Backup ключей**
   - Регулярный backup Vault данных
   - Хранить backup в безопасном месте (S3 с encryption, офлайн хранилище)
   - Тестировать восстановление

5. **Compliance**
   - GDPR: right to be forgotten - удаление ключа "забывает" данные
   - Audit trail всех операций с PII
   - Логирование всех обращений к ключам

### Vault Policies

```hcl
# mongodb-encryption-policy.hcl
# Минимальные права для приложения
path "secret/data/mongodb/master-key" {
  capabilities = ["read"]
}

path "secret/data/mongodb/keys/*" {
  capabilities = ["read"]
}

# Только для admin сервиса
path "secret/metadata/mongodb/keys/*" {
  capabilities = ["read", "list"]
}
```

## Troubleshooting

### Vault недоступен

```bash
# Проверить статус
docker-compose ps vault
docker-compose logs vault

# Перезапустить
docker-compose restart vault
```

### Ошибка "permission denied" при чтении ключа

```bash
# Проверить политики
vault policy read mongodb-encryption

# Проверить токен
vault token lookup

# Пересоздать AppRole
./infra/vault/init-mongodb-encryption.sh
```

### Не удается расшифровать старые данные после ротации

```bash
# Vault хранит старые версии ключей
# Проверить версии
vault kv metadata get secret/mongodb/keys/user-email-key

# Убедиться что max-versions >= 3
vault kv metadata put -max-versions=3 secret/mongodb/keys/user-email-key
```

### Performance degradation после включения encryption

CSFLE добавляет overhead ~10-15%. Оптимизации:
- Шифровать только действительно чувствительные поля
- Использовать Deterministic encryption для поиска по индексам
- Кешировать Data Encryption Keys в памяти приложения
- Использовать connection pooling

## Дополнительные ресурсы

- [MongoDB CSFLE Documentation](https://www.mongodb.com/docs/manual/core/csfle/)
- [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault/docs)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [NIST Key Management Guidelines](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)

## Контакты

При возникновении вопросов или проблем:
- Security Team: security@trainingground.example.com
- DevOps On-call: +7 (XXX) XXX-XX-XX
- Internal Wiki: https://wiki.trainingground.example.com/encryption
