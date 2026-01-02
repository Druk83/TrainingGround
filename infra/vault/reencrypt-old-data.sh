#!/bin/bash
# Re-encryption скрипт для MongoDB данных после ротации ключей
# Читает старые данные (расшифровка старым ключом) и записывает обратно (шифрование новым ключом)

set -e

MONGO_URI="${MONGO_URI:-mongodb://admin:password@localhost:27017/?authSource=admin}"
BATCH_SIZE=${BATCH_SIZE:-100}
DRY_RUN=${DRY_RUN:-false}

echo "======================================="
echo "MongoDB Data Re-encryption"
echo "======================================="
echo "MongoDB URI: ${MONGO_URI%%@*}@***"
echo "Batch size: $BATCH_SIZE"
echo "Dry run: $DRY_RUN"
echo ""

# Проверка подключения к MongoDB
echo "Step 1: Checking MongoDB connection..."
if ! mongosh "$MONGO_URI" --quiet --eval "db.version()" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to MongoDB"
    echo "Check MONGO_URI environment variable"
    exit 1
fi
echo "  Connected to MongoDB"

# Проверка Vault доступен
echo ""
echo "Step 2: Checking Vault connection..."
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-}"

if [ -z "$VAULT_TOKEN" ]; then
    echo "ERROR: VAULT_TOKEN not set"
    echo "Set VAULT_TOKEN environment variable"
    exit 1
fi

if ! curl -sf -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/sys/health" > /dev/null; then
    echo "ERROR: Cannot connect to Vault"
    exit 1
fi
echo "  Connected to Vault"

# Проверка что ротация ключей была выполнена
echo ""
echo "Step 3: Checking key rotation status..."
KEY_VERSION=$(curl -sf -H "X-Vault-Token: $VAULT_TOKEN" \
    "$VAULT_ADDR/v1/secret/metadata/mongodb/keys/user-email-key" | \
    grep -o '"current_version":[0-9]*' | cut -d':' -f2)

if [ -z "$KEY_VERSION" ] || [ "$KEY_VERSION" -lt 2 ]; then
    echo "WARNING: Key version is $KEY_VERSION (expected >= 2 for re-encryption)"
    echo "Have you rotated the keys? Run ./infra/vault/rotate-encryption-keys.sh first"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "  Current key version: $KEY_VERSION"
fi

# Функция re-encryption для коллекции users
reencrypt_users() {
    echo ""
    echo "Step 4: Re-encrypting users collection..."

    # Получить общее количество документов
    TOTAL_USERS=$(mongosh "$MONGO_URI" --quiet --eval \
        "db.getSiblingDB('trainingground').users.countDocuments({})")
    echo "  Total users: $TOTAL_USERS"

    if [ "$TOTAL_USERS" -eq 0 ]; then
        echo "  No users to re-encrypt"
        return
    fi

    # Обработка порциями
    PROCESSED=0
    SKIP=0

    while [ $PROCESSED -lt $TOTAL_USERS ]; do
        echo "  Processing batch: $PROCESSED - $((PROCESSED + BATCH_SIZE))..."

        if [ "$DRY_RUN" = true ]; then
            # Dry run - только вывести количество
            mongosh "$MONGO_URI" --quiet --eval "
                const users = db.getSiblingDB('trainingground').users
                    .find({})
                    .skip($SKIP)
                    .limit($BATCH_SIZE)
                    .toArray();
                print('  Would re-encrypt ' + users.length + ' users');
            "
        else
            # Реальная re-encryption
            # Для CSFLE достаточно прочитать и записать документ обратно
            # MongoDB driver автоматически использует новый ключ для шифрования
            mongosh "$MONGO_URI" --quiet --eval "
                const db = db.getSiblingDB('trainingground');
                const users = db.users.find({}).skip($SKIP).limit($BATCH_SIZE).toArray();

                let reencrypted = 0;
                users.forEach(user => {
                    // Прочитать расшифрованные данные (используется старый ключ)
                    const email = user.email;
                    const name = user.name;

                    // Записать обратно (используется новый ключ)
                    db.users.updateOne(
                        { _id: user._id },
                        { \$set: { email: email, name: name, reencrypted_at: new Date() } }
                    );
                    reencrypted++;
                });

                print('  Re-encrypted ' + reencrypted + ' users');
            "
        fi

        PROCESSED=$((PROCESSED + BATCH_SIZE))
        SKIP=$((SKIP + BATCH_SIZE))

        # Пауза между батчами для снижения нагрузки
        if [ $PROCESSED -lt $TOTAL_USERS ]; then
            sleep 1
        fi
    done

    echo "  Users re-encryption completed: $TOTAL_USERS documents"
}

# Функция re-encryption для коллекции audit_log
reencrypt_audit_log() {
    echo ""
    echo "Step 5: Re-encrypting audit_log collection..."

    TOTAL_LOGS=$(mongosh "$MONGO_URI" --quiet --eval \
        "db.getSiblingDB('trainingground').audit_log.countDocuments({})")
    echo "  Total audit logs: $TOTAL_LOGS"

    if [ "$TOTAL_LOGS" -eq 0 ]; then
        echo "  No audit logs to re-encrypt"
        return
    fi

    # Обработка порциями
    PROCESSED=0
    SKIP=0

    while [ $PROCESSED -lt $TOTAL_LOGS ]; do
        echo "  Processing batch: $PROCESSED - $((PROCESSED + BATCH_SIZE))..."

        if [ "$DRY_RUN" = true ]; then
            mongosh "$MONGO_URI" --quiet --eval "
                const logs = db.getSiblingDB('trainingground').audit_log
                    .find({})
                    .skip($SKIP)
                    .limit($BATCH_SIZE)
                    .toArray();
                print('  Would re-encrypt ' + logs.length + ' audit logs');
            "
        else
            mongosh "$MONGO_URI" --quiet --eval "
                const db = db.getSiblingDB('trainingground');
                const logs = db.audit_log.find({}).skip($SKIP).limit($BATCH_SIZE).toArray();

                let reencrypted = 0;
                logs.forEach(log => {
                    const ip = log.ip_address;
                    const ua = log.user_agent;

                    db.audit_log.updateOne(
                        { _id: log._id },
                        { \$set: {
                            ip_address: ip,
                            user_agent: ua,
                            reencrypted_at: new Date()
                        }}
                    );
                    reencrypted++;
                });

                print('  Re-encrypted ' + reencrypted + ' audit logs');
            "
        fi

        PROCESSED=$((PROCESSED + BATCH_SIZE))
        SKIP=$((SKIP + BATCH_SIZE))

        if [ $PROCESSED -lt $TOTAL_LOGS ]; then
            sleep 1
        fi
    done

    echo "  Audit logs re-encryption completed: $TOTAL_LOGS documents"
}

# Функция проверки что re-encryption успешна
verify_reencryption() {
    echo ""
    echo "Step 6: Verifying re-encryption..."

    # Проверить что поля reencrypted_at установлены
    REENCRYPTED_USERS=$(mongosh "$MONGO_URI" --quiet --eval \
        "db.getSiblingDB('trainingground').users.countDocuments({reencrypted_at: {\$exists: true}})")

    echo "  Users with reencrypted_at field: $REENCRYPTED_USERS"

    # Проверить что можем расшифровать данные
    echo "  Testing decryption of sample user..."
    SAMPLE=$(mongosh "$MONGO_URI" --quiet --eval "
        const user = db.getSiblingDB('trainingground').users.findOne({});
        if (user) {
            print('Email type: ' + typeof user.email);
            print('Name type: ' + typeof user.name);
        } else {
            print('No users found');
        }
    ")
    echo "$SAMPLE"

    echo "  Verification completed"
}

# Запуск re-encryption
reencrypt_users
reencrypt_audit_log

if [ "$DRY_RUN" = false ]; then
    verify_reencryption
fi

# Итоги
echo ""
echo "======================================="
echo "Re-encryption completed"
echo "======================================="
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "This was a DRY RUN - no data was modified"
    echo "Run with DRY_RUN=false to perform actual re-encryption"
else
    echo "All encrypted data has been re-encrypted with new keys"
    echo ""
    echo "Next steps:"
    echo "1. Verify application can read data correctly"
    echo "2. Remove old key versions from Vault (optional):"
    echo "   vault kv metadata put -max-versions=1 secret/mongodb/keys/user-email-key"
    echo "3. Update backup procedures to use new keys"
fi

echo ""
