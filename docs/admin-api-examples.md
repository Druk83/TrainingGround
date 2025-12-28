# Примеры использования admin API через curl

Перед запуском экспортируйте токен администратора:
```powershell
$env:ADMIN_TOKEN = 'eyJhbGciOiJI...'
$env:API = 'http://localhost:3000'
```

## 1. Получить список пользователей
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" ^
     -H "Content-Type: application/json" ^
     "$API/admin/users?limit=20&search=ivan"
```

## 2. Создать резервную копию
```bash
curl -X POST "$API/admin/backups/create" ^
     -H "Authorization: Bearer $ADMIN_TOKEN" ^
     -H "Content-Type: application/json" ^
     -d '{"label":"nightly"}'
```

## 3. Обновить настройки YandexGPT
```bash
curl -X PUT "$API/admin/settings/yandexgpt" ^
     -H "Authorization: Bearer $ADMIN_TOKEN" ^
     -H "Content-Type: application/json" ^
     -d '{
       "api_key":"ya-xxxx",
       "folder_id":"b1gxxx",
       "model":"yandexgpt",
       "temperature":0.3,
       "max_tokens":500
     }'
```

## 4. Запросить аудит-логи
```bash
curl "$API/admin/audit?limit=50&action=login" ^
     -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 5. Тестовое письмо (SMTP)
```bash
curl -X POST "$API/admin/settings/test/email" ^
     -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 6. Античит-инциденты
```bash
curl "$API/admin/anticheat?severity=high" ^
     -H "Authorization: Bearer $ADMIN_TOKEN"
```

Подробные схемы запросов смотрите в `frontend/src/lib/api-types.ts` и соответствующих хендлерах в `backend/rust-api/src/handlers/admin/*`.
