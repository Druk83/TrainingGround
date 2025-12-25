# Тестирование задачи A6 через Docker (Production-like)

## Подготовка

### 1. Сгенерировать учетную запись администратора

```cmd
python scripts/generate_superuser_secret.py --email admin@localhost --name "Admin User" --groups admin
```

Сохраните пароль из вывода!

### 2. Сгенерировать JWT токен для доступа

```cmd
set JWT_SECRET=<ваш_JWT_SECRET_из_.env>
python scripts/generate_admin_jwt.py
```

Скопируйте JWT токен из вывода.

## Запуск через Docker

### 1. Запустить все сервисы

```cmd
docker-compose up -d
```

Это запустит:
- MongoDB Replica Set (3 ноды)
- Redis
- Qdrant
- Rust API с bootstrap superuser
- Python Generator
- Monitoring stack (опционально)

### 2. Проверить что superuser создался

```cmd
docker-compose logs rust-api | findstr "superuser"
```

Должны увидеть:
```
INFO trainingground_api::services::superuser_seed: Found superuser seed file path: /secrets/admin-superuser.json
INFO trainingground_api::services::superuser_seed: Superuser seed file found at /secrets/admin-superuser.json
INFO trainingground_api::services::superuser_seed: Bootstrapping superuser with email admin@localhost
INFO trainingground_api::services::superuser_seed: Superuser inserted; remove seed file to prevent rerun
```

### 3. Запустить Frontend (локально)

```cmd
cd frontend
npm run dev
```

### 4. Открыть админку

1. Откройте http://localhost:5173/admin
2. Откройте DevTools (F12) → Console
3. Выполните:

```javascript
localStorage.setItem('auth_token', 'ВАШ_JWT_ТОКЕН_СЮДА')
```

4. Обновите страницу (F5)

## Проверка функционала A6

### 1. Админ-консоль загрузилась

- Видна таблица шаблонов
- Сайдбар с очередью эмбеддингов
- Сайдбар с feature flags

### 2. Фильтры работают

- Поиск по slug
- Фильтр по статусу (draft/ready/published/deprecated)
- Фильтр по сложности
- Настройка limit

### 3. Workflow статусов

- Кнопка "Publish" для публикации шаблона
- Кнопка "Revert" с указанием причины
- Статусы отображаются корректно

### 4. Очередь эмбеддингов

- Показывается длина очереди Redis Stream `content:changes`
- Отображается последнее событие

### 5. Feature Flags

- Список флагов загружается
- Toggle для включения/выключения работает

### 6. Безопасность

- Проверить что секретный файл НЕ в git:
```cmd
git status | findstr admin-superuser.json
```
Должен быть пустой вывод (файл в .gitignore).

- Проверить что example файл В репозитории:
```cmd
git ls-files | findstr admin-superuser.example.json
```
Должен показать файл.

## Проверка API напрямую

### Healthcheck

```cmd
curl http://localhost:8081/health
```

### Получить список шаблонов (требует JWT)

```cmd
curl -H "Authorization: Bearer ВАШ_JWT_ТОКЕН" http://localhost:8081/admin/templates
```

### Получить статус очереди

```cmd
curl -H "Authorization: Bearer ВАШ_JWT_ТОКЕН" http://localhost:8081/admin/queue
```

### Получить feature flags

```cmd
curl -H "Authorization: Bearer ВАШ_JWT_ТОКЕН" http://localhost:8081/admin/feature-flags
```

## Автоматические тесты (pre-commit)

Проверить что A6 тесты проходят:

```bash
bash .githooks/pre-commit-rust
```

Должны пройти:
- 5 integration тестов content_validation_test
- Проверка .gitignore на admin-superuser.json
- Проверка существования example файла
- Проверка что секретные файлы не в staging

## Troubleshooting

### Superuser не создался

Проверить логи:
```cmd
docker-compose logs rust-api --tail=100
```

Проверить что файл доступен в контейнере:
```cmd
docker exec trainingground-rust-api sh -c "ls -la /secrets/"
docker exec trainingground-rust-api sh -c "cat /secrets/admin-superuser.json"
```

Проверить переменную окружения:
```cmd
docker exec trainingground-rust-api sh -c "printenv ADMIN_SEED_FILE"
```

### JWT токен не работает

Проверить что JWT_SECRET совпадает:
- В .env файле
- В docker-compose.yml (APP__AUTH__JWT_SECRET)
- В скрипте generate_admin_jwt.py

### API недоступен

Проверить что контейнер запущен:
```cmd
docker-compose ps rust-api
```

Проверить логи:
```cmd
docker-compose logs rust-api
```

## Очистка

Остановить все сервисы:
```cmd
docker-compose down
```

Удалить volumes (осторожно, удалит все данные):
```cmd
docker-compose down -v
```
