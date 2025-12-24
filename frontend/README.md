# TrainingGround Frontend PWA

Учебное PWA-приложение для запуска уроков, таймеров и офлайн-прохождения, реализованное на Vite + Lit Web Components. Поддерживает фичи из задания A4: каталог уроков, Lesson Player, подсказки, таймеры, live-обновление статистики, офлайн-очередь и сервис-воркер с Workbox.

## Быстрый старт

```bash
cd frontend
npm install
npm run dev # http://localhost:4173
```

### Команды
- `npm run dev` — запуск Vite dev-сервера с HMR и dev PWA.
- `npm run build` / `npm run preview` — сборка и предпросмотр.
- `npm run test` — unit-тесты (Vitest, offline queue).
- `npm run test:components` — Web Component snapshot на Web Test Runner + Playwright.
- `npm run lint` / `npm run format` — ESLint + Prettier.

## Архитектура

```
frontend/
├─ src/app-shell.ts            # Корневой layout, связывает store и компоненты
├─ lib/
│   ├─ api-client.ts           # Fetch-клиент с JWT и idempotency
│   ├─ session-store.ts        # Глобальное состояние (user, lessons, timer, offline)
│   ├─ offline-queue.ts        # IndexedDB очередь + Background Sync
│   ├─ feature-flags.ts        # VITE_/window flags
│   ├─ timer-stream.ts         # SSE клиент timer-tick/time-expired
│   └─ analytics.ts            # Поведенческие события -> Rust API
├─ components/                 # Lit Web Components (catalog, player, timer, hints…)
├─ services/explanations.ts    # API клиента Python/Rust подсказок
├─ styles/global.css           # Темные токены/сетку
└─ sw.ts                       # Workbox service worker + runtime caching + BGS
```

## UX / Фичи
- **Catalog**: responsive колонки XL→XXS, статусы уроков, блокировка при точности < 80%.
- **Lesson Player**: live таймер (SSE), answer input с Ctrl+Enter, scoreboard (score/streak/hints).
- **Hints & Explanations**: кнопка подсказки (-5 баллов, лимит 2), панель Python/Rust объяснений.
- **Offline queue**: IndexedDB + Workbox background-sync, индикатор статуса/конфликтов.
- **Service Worker**: shell caching, API NetworkFirst, skipWaiting banner, offline-ready уведомление.
- **Analytics/anticheat**: собираем скорость печати, отправляем в Rust API с feature flag.
- **Адаптивность/доступность**: aria-live для таймера, клавиатурные шорткаты (Ctrl+Enter), лаконичные фокусы.
- **Документация**: README + inline комментарии, тесты для offline менеджера и компонентов.

## Настройки
- `VITE_API_BASE` – базовый URL Rust API (`/api/v1` по умолчанию).
- `VITE_EXPLANATION_API` – override для Python генератора.
- `VITE_FEATURE_FLAGS` – JSON строка с feature flags (`{"offlineQueue":false}` ...).

## Hotkeys & Edge cases
- `Ctrl + Enter` – отправка ответа.
- При оффлайне ответы/подсказки складываются в очередь, при восстановлении сети показывается snackbar.
- Конфликты (сервер уже получил ответ) подсвечиваются в ConnectionIndicator и хранятся до ручной синхронизации.
- SW уведомляет о свежей версии (skipWaiting) и offline-ready событии.
