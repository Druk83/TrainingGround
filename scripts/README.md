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

## MongoDB Keyfile Management

### generate_mongo_keyfile.sh

Генерирует криптографически стойкий keyfile для MongoDB replica set.

**Использование:**

```bash
# Генерация в дефолтное место (infra/mongo-keyfile)
./scripts/generate_mongo_keyfile.sh

# Генерация в кастомное место
./scripts/generate_mongo_keyfile.sh /path/to/keyfile
```

**Что делает:**
- Генерирует 756 байт случайных данных в base64 формате
- Создает backup старого keyfile (если существует)
- Устанавливает права доступа 400 (read-only для owner)
- Выводит инструкции по использованию

**Требования к keyfile:**
- Размер: 6-1024 байт
- Формат: base64 (A-Z, a-z, 0-9, +, /)
- Права: 400 (только чтение для владельца)
- Одинаковый файл на всех членах replica set

---

### rotate_mongo_keyfile.sh

Ротация MongoDB keyfile с zero downtime (rolling restart).

**Использование:**

```bash
./scripts/rotate_mongo_keyfile.sh
```

**Процесс:**
1. Генерирует новый keyfile
2. Проверяет, что MongoDB сервисы запущены
3. Копирует новый keyfile на все члены replica set
4. Выполняет rolling restart (secondary → primary)
5. Проверяет здоровье replica set
6. Обновляет локальную копию keyfile

**Когда нужна ротация:**
- Регулярно каждые 90 дней (security compliance)
- При подозрении на утечку ключа
- При увольнении сотрудника с доступом к серверам
- После удаления keyfile из git history

---

### git_remove_keyfile_history.sh

Удаляет `infra/mongo-keyfile` из git history навсегда.

**ВНИМАНИЕ:** Этот скрипт переписывает git history!

**Использование:**

```bash
./scripts/git_remove_keyfile_history.sh
```

**Что делает:**
1. Создает backup репозитория
2. Удаляет файл из всех коммитов (git filter-branch)
3. Очищает git references и запускает garbage collection
4. Проверяет успешное удаление

**После выполнения ОБЯЗАТЕЛЬНО:**
1. Force push: `git push origin --force --all`
2. Уведомить всю команду re-clone репозиторий
3. Немедленно выполнить ротацию keyfile
4. Считать старый keyfile скомпрометированным

**Use case:** Если keyfile случайно попал в git history и был обнаружен secret scanning tools.

---

### generate_admin_jwt.py

Генерирует JWT токен для доступа к admin API.

**Использование:**

```bash
python3 scripts/generate_admin_jwt.py \
  --email admin@example.com \
  --secret YOUR_SECRET_KEY
```

**Параметры:**
- `--email` - Email администратора
- `--secret` - Secret key для подписи JWT (из .env: JWT_SECRET)
- `--expiry` - Время жизни токена в днях (по умолчанию 30)

**Требования:**
- PyJWT>=2.8.0 (установлено в venv)

---

## Дополнительные скрипты

### setup-dev.sh

Настройка локального окружения для разработки.

### pre-commit.sh

Git pre-commit hook для проверки кода перед коммитом.

---

## Безопасность

- Все секретные файлы (`admin-superuser.json`, `mongo-keyfile`) исключены из git через `.gitignore`
- Пароли хешируются bcrypt (cost=12) перед сохранением
- MongoDB keyfile генерируется криптографически стойким генератором
- Example файлы содержат только placeholder'ы, не реальные данные
- Pre-commit hooks проверяют staging на наличие секретных файлов

Подробная документация:
- [docs/deployment-security.md](../docs/deployment-security.md)
- [docs/mongodb-security.md](../docs/mongodb-security.md)
- [tasks/TD-07.md](../tasks/TD-07.md)
