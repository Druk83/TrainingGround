#!/bin/bash
# Инициализация HashiCorp Vault для MongoDB Encryption at Rest
# Создает необходимые ключи шифрования и настраивает политики доступа

set -e

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Инициализация Vault для MongoDB Encryption ===${NC}"

# Vault адрес и токен из переменных окружения
VAULT_ADDR=${VAULT_ADDR:-http://localhost:8200}
VAULT_TOKEN=${VAULT_TOKEN:-dev-root-token}

export VAULT_ADDR
export VAULT_TOKEN

# Проверка доступности Vault
echo -e "${YELLOW}Проверка доступности Vault...${NC}"
if ! vault status > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Vault недоступен по адресу $VAULT_ADDR${NC}"
    echo "Убедитесь что Vault запущен: docker-compose up vault"
    exit 1
fi

echo -e "${GREEN}✓ Vault доступен${NC}"

# 1. Включение KV v2 secrets engine
echo -e "${YELLOW}Включение KV v2 secrets engine...${NC}"
vault secrets enable -path=secret -version=2 kv 2>/dev/null || echo "KV engine уже включен"

# 2. Создание Data Encryption Keys (DEK) для CSFLE
echo -e "${YELLOW}Генерация ключей шифрования для PII полей...${NC}"

# Генерация 96-байтовых ключей для CSFLE (base64)
# MongoDB CSFLE использует 96-byte master keys
generate_96byte_key() {
    openssl rand -base64 96 | tr -d '\n'
}

# Master Key для Key Encryption Key (KEK)
MASTER_KEY=$(generate_96byte_key)
vault kv put secret/mongodb/master-key \
    key="$MASTER_KEY" \
    created_at="$(date -Iseconds)" \
    rotation_period_days=90 \
    version=1

echo -e "${GREEN}✓ Master key создан${NC}"

# Data Encryption Keys (DEK) для каждого поля
# user-email-key (deterministic для поиска по email)
vault kv put secret/mongodb/keys/user-email-key \
    key="$(generate_96byte_key)" \
    algorithm="AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic" \
    purpose="Encryption of user email addresses" \
    created_at="$(date -Iseconds)" \
    rotation_period_days=90 \
    version=1

echo -e "${GREEN}✓ user-email-key создан${NC}"

# user-name-key
vault kv put secret/mongodb/keys/user-name-key \
    key="$(generate_96byte_key)" \
    algorithm="AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    purpose="Encryption of user names" \
    created_at="$(date -Iseconds)" \
    rotation_period_days=90 \
    version=1

echo -e "${GREEN}✓ user-name-key создан${NC}"

# audit-ip-key
vault kv put secret/mongodb/keys/audit-ip-key \
    key="$(generate_96byte_key)" \
    algorithm="AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    purpose="Encryption of IP addresses in audit logs" \
    created_at="$(date -Iseconds)" \
    rotation_period_days=90 \
    version=1

echo -e "${GREEN}✓ audit-ip-key создан${NC}"

# audit-useragent-key
vault kv put secret/mongodb/keys/audit-useragent-key \
    key="$(generate_96byte_key)" \
    algorithm="AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    purpose="Encryption of user agent strings in audit logs" \
    created_at="$(date -Iseconds)" \
    rotation_period_days=90 \
    version=1

echo -e "${GREEN}✓ audit-useragent-key создан${NC}"

# 3. Создание политики доступа для Rust API
echo -e "${YELLOW}Создание политики доступа для приложения...${NC}"

cat > /tmp/mongodb-encryption-policy.hcl <<EOF
# Политика для чтения ключей шифрования MongoDB
path "secret/data/mongodb/master-key" {
  capabilities = ["read"]
}

path "secret/data/mongodb/keys/*" {
  capabilities = ["read"]
}

# Для ротации ключей (только для admin сервиса)
path "secret/metadata/mongodb/keys/*" {
  capabilities = ["read", "list"]
}
EOF

vault policy write mongodb-encryption /tmp/mongodb-encryption-policy.hcl
rm /tmp/mongodb-encryption-policy.hcl

echo -e "${GREEN}✓ Политика доступа создана${NC}"

# 4. Создание AppRole для Rust API
echo -e "${YELLOW}Создание AppRole для аутентификации приложения...${NC}"

vault auth enable approle 2>/dev/null || echo "AppRole auth уже включен"

vault write auth/approle/role/rust-api \
    token_ttl=1h \
    token_max_ttl=4h \
    token_policies="mongodb-encryption" \
    bind_secret_id=true \
    secret_id_ttl=0

# Получение role-id и secret-id для приложения
ROLE_ID=$(vault read -field=role_id auth/approle/role/rust-api/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/rust-api/secret-id)

echo -e "${GREEN}✓ AppRole создан${NC}"
echo ""
echo -e "${YELLOW}Добавьте в .env файл:${NC}"
echo "VAULT_ROLE_ID=$ROLE_ID"
echo "VAULT_SECRET_ID=$SECRET_ID"
echo ""

# 5. Сохранение метаданных для мониторинга ротации
vault kv put secret/mongodb/rotation-config \
    enabled=true \
    rotation_period_days=90 \
    next_rotation_date="$(date -d '+90 days' -Iseconds)" \
    notification_days_before=7

echo -e "${GREEN}✓ Конфигурация ротации сохранена${NC}"

# 6. Тестирование доступа
echo -e "${YELLOW}Тестирование доступа к ключам...${NC}"

# Проверка чтения master key
if vault kv get secret/mongodb/master-key > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Master key доступен${NC}"
else
    echo -e "${RED}✗ Не удалось прочитать master key${NC}"
    exit 1
fi

# Список всех ключей
echo -e "${YELLOW}Созданные ключи:${NC}"
vault kv list secret/mongodb/keys

echo ""
echo -e "${GREEN}=== Инициализация завершена успешно ===${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo "1. Добавьте VAULT_ROLE_ID и VAULT_SECRET_ID в .env файл"
echo "2. Перезапустите rust-api: docker-compose restart rust-api"
echo "3. Настройте автоматическую ротацию ключей (cron job)"
echo "4. В production используйте Vault с HA конфигурацией (Consul/etcd backend)"
echo ""
echo -e "${YELLOW}Доступ к Vault UI:${NC} http://localhost:8200"
echo -e "${YELLOW}Root Token:${NC} $VAULT_TOKEN (СОХРАНИТЕ В БЕЗОПАСНОМ МЕСТЕ!)"
echo ""
