#!/bin/bash
# Автоматическая ротация ключей шифрования MongoDB
# Запускается по cron каждые 90 дней

set -e

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== MongoDB Encryption Keys Rotation ===${NC}"
echo "Start time: $(date)"

# Vault адрес и токен
VAULT_ADDR=${VAULT_ADDR:-http://localhost:8200}
VAULT_TOKEN=${VAULT_TOKEN}

if [ -z "$VAULT_TOKEN" ]; then
    echo -e "${RED}ERROR: VAULT_TOKEN not set${NC}"
    exit 1
fi

export VAULT_ADDR
export VAULT_TOKEN

# Функция генерации 96-байтового ключа
generate_96byte_key() {
    openssl rand -base64 96 | tr -d '\n'
}

# Функция для ротации одного ключа
rotate_key() {
    local key_path=$1
    local algorithm=$2
    local purpose=$3

    echo -e "${YELLOW}Ротация ключа: $key_path${NC}"

    # Получение текущей версии
    current_version=$(vault kv metadata get -format=json "$key_path" | jq -r '.data.current_version // 1')
    new_version=$((current_version + 1))

    # Создание новой версии ключа
    vault kv put "$key_path" \
        key="$(generate_96byte_key)" \
        algorithm="$algorithm" \
        purpose="$purpose" \
        created_at="$(date -Iseconds)" \
        rotation_period_days=90 \
        version="$new_version" \
        previous_version="$current_version"

    echo -e "${GREEN}✓ Ключ обновлен: v$current_version -> v$new_version${NC}"

    # Vault автоматически сохраняет старые версии для расшифровки
    # Ограничиваем количество версий до 3
    vault kv metadata put -max-versions=3 "$key_path"
}

# Проверка доступности Vault
echo -e "${YELLOW}Проверка доступности Vault...${NC}"
if ! vault status > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Vault недоступен${NC}"
    exit 1
fi

# Проверка срока следующей ротации
rotation_config=$(vault kv get -format=json secret/mongodb/rotation-config)
next_rotation=$(echo "$rotation_config" | jq -r '.data.data.next_rotation_date')
current_date=$(date -Iseconds)

echo "Следующая плановая ротация: $next_rotation"
echo "Текущая дата: $current_date"

# Можно добавить проверку, чтобы не ротировать раньше времени
# if [[ "$current_date" < "$next_rotation" ]]; then
#     echo "Ротация еще не требуется"
#     exit 0
# fi

# Ротация всех ключей
echo -e "${YELLOW}Начинается ротация ключей...${NC}"

# Master key
rotate_key "secret/mongodb/master-key" "KEK" "Master key for key encryption"

# Data encryption keys
rotate_key "secret/mongodb/keys/user-email-key" \
    "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic" \
    "Encryption of user email addresses"

rotate_key "secret/mongodb/keys/user-name-key" \
    "AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    "Encryption of user names"

rotate_key "secret/mongodb/keys/audit-ip-key" \
    "AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    "Encryption of IP addresses in audit logs"

rotate_key "secret/mongodb/keys/audit-useragent-key" \
    "AEAD_AES_256_CBC_HMAC_SHA_512-Random" \
    "Encryption of user agent strings in audit logs"

# Обновление даты следующей ротации
next_rotation_date=$(date -d '+90 days' -Iseconds)
vault kv put secret/mongodb/rotation-config \
    enabled=true \
    rotation_period_days=90 \
    next_rotation_date="$next_rotation_date" \
    last_rotation_date="$(date -Iseconds)" \
    notification_days_before=7

echo -e "${GREEN}✓ Все ключи успешно ротированы${NC}"
echo "Следующая ротация: $next_rotation_date"

# Логирование в audit log
echo "[$(date -Iseconds)] Key rotation completed successfully" >> /var/log/mongodb/encryption-audit.log 2>/dev/null || true

# Отправка уведомления (можно интегрировать с Slack, email и т.д.)
# curl -X POST https://hooks.slack.com/... -d "Keys rotated successfully"

echo ""
echo -e "${GREEN}=== Ротация завершена ===${NC}"
echo "End time: $(date)"

# ВАЖНО: После ротации ключей приложение автоматически получит новые ключи
# при следующем обращении к Vault (благодаря versioning в KV v2)
# Старые данные останутся расшифровываемыми благодаря хранению старых версий ключей

echo ""
echo -e "${YELLOW}ВАЖНО:${NC}"
echo "1. Старые данные автоматически расшифровываются старыми версиями ключей"
echo "2. Новые данные шифруются новыми ключами"
echo "3. Для re-encryption старых данных запустите: ./reencrypt-old-data.sh"
echo "4. Vault хранит последние 3 версии каждого ключа"
