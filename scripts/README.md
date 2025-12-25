# Scripts

Вспомогательные скрипты для администрирования проекта.

## Генерация супер-пользователя

### generate_superuser_secret.py

Генерирует секретный JSON файл с главной учетной записью для первого запуска.

**Использование:**

```bash
python3 scripts/generate_superuser_secret.py \
  --email admin@yourcompany.com \
  --name "Platform Admin" \
  --groups admin production
```

**Параметры:**
- `--email` (обязательно) - Email супер-пользователя
- `--name` (опционально) - Отображаемое имя (по умолчанию "Super Admin")
- `--groups` (опционально) - Список групп через пробел (по умолчанию ["admin"])
- `--output` (опционально) - Путь к выходному файлу

**Вывод:**

Скрипт создаст файл с рандомным паролем (24 символа) и выведет его в консоль:

```
✓ Seed file written to infra/config/seed/admin-superuser.json

SECURITY WARNINGS:
   1. DO NOT commit this file to git (.gitignore should exclude it)
   2. Store this file in a secure vault
   3. Save the generated password securely:

   Email:    admin@yourcompany.com
   Password: <RANDOM_24_CHAR_PASSWORD>

   Password will be hashed with bcrypt during bootstrap.
```

**ВАЖНО:** Сохраните пароль в защищённом месте. Файл используется только для первого запуска API.

---

## Массовый импорт шаблонов

### import_templates.py

Загружает темы, уровни, правила и шаблоны из JSON файла в MongoDB.

**Использование:**

```bash
# Проверка без записи в БД
python3 scripts/import_templates.py --dry-run

# Реальный импорт
python3 scripts/import_templates.py --file infra/config/seed/admin_templates.json
```

**Параметры:**
- `--file` - Путь к JSON файлу с данными (по умолчанию `infra/config/seed/admin_templates.json`)
- `--dry-run` - Режим проверки без записи в БД

**Переменные окружения:**
- `MONGODB_URI` или `MONGO_URI` - URI подключения к MongoDB
- `MONGODB_DATABASE` или `MONGO_DATABASE` - Имя базы данных

---

## Bootstrap супер-пользователя

### bootstrap-superuser.sh

Shell скрипт для запуска API с автоматическим созданием супер-пользователя.

**Использование:**

```bash
# С явным указанием файла
./scripts/bootstrap-superuser.sh /path/to/admin-superuser.json

# С переменной окружения
ADMIN_SEED_FILE=/path/to/admin-superuser.json ./scripts/bootstrap-superuser.sh
```

**Проверки скрипта:**
- Существование файла
- Валидность JSON
- Наличие обязательных полей (email, password, role)
- Длина пароля (предупреждение если < 16 символов)
- Защита от использования example файла

---

## Дополнительные скрипты

### setup-dev.sh

Настройка локального окружения для разработки.

### pre-commit.sh

Git pre-commit hook для проверки кода перед коммитом.

---

## Безопасность

- Все секретные файлы (`admin-superuser.json`) исключены из git через `.gitignore`
- Пароли хешируются bcrypt (cost=12) перед сохранением
- Example файлы содержат только placeholder'ы, не реальные данные

Подробная документация: [docs/deployment-security.md](../docs/deployment-security.md)
