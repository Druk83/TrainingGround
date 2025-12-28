# Troubleshooting для UI суперадмина

## 1. Не удается скомпилировать backend (link.exe / LNK1285)
- Запустите `Visual Studio Installer` → `C++ build tools` → `Repair`.
- Убедитесь, что достаточно места на диске `B:` и нет занятых `.pdb` (закрыть VSCode/CLion).

## 2. `cargo test admin_*` падает из-за Mongo/Redis
- Проверьте, что `docker-compose up mongo redis` запущен.
- Конфигурация берется из `trainingground_api::config::TestConfig` (URI `mongodb://admin:changeMe123@localhost:27017/...`).

## 3. Лимиты 429 при работе UI
- В локальной среде установите `RATE_LIMIT_DISABLED=true` или поднимите `ADMIN_RATE_LIMIT_MAX=100`.
- После изменения переменных перезапустите backend.

## 4. Секреты не отображаются на `/admin/settings`
- Проверьте, что API возвращает `system_settings` (коллекция в Mongo). Если документ отсутствует, сохранение любой карточки создаст его.
- Кнопки «Показать» используют локальное состояние; убедитесь, что в браузере разрешен JavaScript/не включен NoScript.

## 5. Нотификация «CSRF token missing»
- Для POST-запросов из Postman/тестов сначала запросите `/api/v1/auth/csrf-token`, возьмите cookie `csrf_token` и header `x-csrf-token`.
- В UI CSRF добавляется автоматически, поэтому ошибка появляется только при ручных обращениях.

## 6. Vitest показывает `Lit is in dev mode`
- Это предупреждение, его можно игнорировать в локальной среде. Для прод-сборки используйте `npm run build` (Vite + esbuild отключают dev-mode).

## 7. Admin UI пустой после логина
- Проверьте `localStorage.auth`, что токен содержит `"role":"admin"`.
- Убедитесь, что `frontend/src/main.ts` загружает нужную страницу (в DevTools → Console ищите `[Router]`).

## 8. Бэкапы не создаются
- Логи backend (`cargo run`) покажут ошибки `BackupService`. Сейчас сервис сохраняет метаданные в Mongo, требуется доступ к коллекции `backups`.
- Проверьте, что пользователь имеет роль `admin`, иначе кнопка скрыта.
