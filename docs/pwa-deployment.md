# PWA deployment checklist

Этот документ описывает, как собрать и выкатить PWA на staging/production, чтобы сохранить офлайн‑режим, автообновления и корректный manifest.

## Сборка

1. Установите зависимости и соберите фронтенд
   ```bash
   cd frontend
   npm ci
   npm run build
   ```
2. Сгенерированная папка `frontend/dist` содержит готовый bundle, manifest и service worker (через `vite-plugin-pwa`).
3. Для smoke‑проверки используйте `npm run preview` — он запускает статический сервер на `4173`, имитируя боевую сборку.

## Manifest и иконки

- Файл `public/manifest.webmanifest` описывает название, цвета, режим `standalone` и набор иконок (192px и 512px) в `public/icons/`.
- При деплое манифест и иконки должны быть доступны по HTTPS и кешироваться с подходящим `Cache-Control`.

## Service Worker и Workbox

- Service Worker создаётся плагином `vite-plugin-pwa` и использует Workbox для precache/ runtime‑кэшей.
- UI слушает события `sw-update-available` и показывает баннер с кнопкой «Обновить».
- Чтобы обновления применялись без залипания старых ассетов, убедитесь, что сервер отдает `service-worker.js` с `Cache-Control: no-cache`.

## Lighthouse и a11y

- Перед выкатыванием прогоните
  ```bash
  npm run preview
  npm run lighthouse
  npm run test:a11y
  ```
  Первая команда стартует статику, вторая сохраняет HTML‑отчёт (`lighthouse-report.html`), третья проверяет состояния интерфейса с axe.
- Целевые метрики: Performance ≥ 80, PWA/Accessibility/Best Practices ≥ 90. Если показатели ниже, устраните предупреждения Lighthouse и перезапустите аудит.

## Продакшн‑деплой

1. Загрузите содержимое `frontend/dist` на статический хостинг (S3+CloudFront, Netlify, Firebase Hosting и т.д.).
2. Убедитесь, что домен обслуживается по HTTPS; без HTTPS Service Worker не активируется.
3. Настройте прокси до API (`/api/*`) и SSE (`/api/v1/sessions/:id/stream`), чтобы URL совпадал с тем, что прошит в `import.meta.env.VITE_API_BASE`.
4. Активируйте gzip/brotli и long-term кеширование `assets/*.js`/`*.css`.
5. Опционально включите SRI: при упаковке создайте `.integrity` manifest или используйте middleware, который добавляет `integrity` и `crossorigin` в `<script>`/`<link>`.

## OTA‑обновления

- После выката новой версии проверьте в DevTools > Application > Service Workers, что флаг `Update on reload` выключен и обновление выполняется через наш баннер.
- Если нужно принудительно обновить клиентов, увеличьте `__APP_VERSION__` (инжектится Vite) и попросите пользователей нажать кнопку в баннере.

## Мониторинг

- Сохраняйте HTML/JSON отчёты Lighthouse (команды `npm run lighthouse*`) как CI‑артефакты.
- Подключите Web Vitals (например, через `analytics.ts`), чтобы сравнивать реальные метрики RUM с лабораторными.
