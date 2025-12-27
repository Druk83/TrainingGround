# Русский язык: тренировочный полигон

Игровой тренажёр по русскому языку, который помогает школьникам 8–11 классов и взрослым тренировать грамматику, орфографию и пунктуацию через короткие сессии с таймерами, баллами, подсказками и аналитикой. Проект ведётся по комплекту требований в папке `requirements/`.

## Быстрый старт для разработчиков

### 1. Установите зависимости

- **Node.js** 24.x LTS - https://nodejs.org/
- **Rust** 1.89+ - https://rustup.rs/
- **Python** 3.14+ - https://www.python.org/
- **Docker Desktop** - https://www.docker.com/products/docker-desktop/

### 2. Настройте окружение

```powershell
# Запустите скрипт настройки (Windows)
powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1

# Linux/macOS
./scripts/setup-dev.sh
```

### 3. Конфигурация и запуск

```powershell
# Создайте .env файл
copy .env.example .env

# Сгенерируйте безопасные пароли
powershell -ExecutionPolicy Bypass -File infra\scripts\generate_secrets.ps1

# Проверьте конфигурацию
infra\scripts\check_env.cmd

# Запуск сервисов (Windows)
dev.cmd up

# Linux/macOS
# cp .env.example .env
# bash infra/scripts/generate_secrets.sh
# bash infra/scripts/check_env.sh
# make up

# Проверка статуса
docker-compose ps
```
make dev-setup

# Запустите локальное окружение
make up
```

Подробная инструкция: [docs/dev-setup.md](docs/dev-setup.md)

## Команды разработки

```powershell
make test       # Запустить все тесты
make lint       # Проверить код линтерами
make format     # Отформатировать код
make audit      # Проверить безопасность
make help       # Показать все команды
```

### Frontend / PWA скрипты

```powershell
npm run dev            # Vite Dev Server
npm run test:components # Web Test Runner (Lit компоненты)
npm run test:e2e       # Playwright сценарии (нужен `npx playwright install`)
npm run test:a11y      # axe + Playwright регрессия состояний
npm run preview        # Статический сервер сборки на 4173 порту
npm run lighthouse     # Lighthouse (запускайте после preview)
npm run lighthouse:ci  # JSON отчет для CI
npm run storybook      # Storybook с интерактивными story компонентов
npm run build-storybook # статическая сборка Storybook для публикации
```

## Git Hooks и безопасность

Проект использует pre-commit hooks для автоматической проверки кода перед коммитом.

### Настройка Git Hooks

```powershell
# Один раз после клонирования репозитория
git config core.hooksPath .githooks

# Проверка настройки
git config --get core.hooksPath
# Должно вывести: .githooks
```

### Что проверяют Pre-commit Hooks

**Security Checks (`.githooks/pre-commit-secrets`):**
- Хардкоденные секреты (JWT_SECRET, API keys, пароли)
- Попытки закоммитить `.env`, `.env.prod`, `.env.production`
- Реальные секреты в `.env.example` (вместо placeholders)
- MongoDB keyfiles (`mongo-keyfile`, `mongo-keyfile.secure`)
- Credential files (`credentials.json`, `*.pem`, `*.key`, `admin-superuser.json`)
- Проверяет что используются env vars: `process.env.JWT_SECRET`, `std::env::var("JWT_SECRET")`

**Component-specific Checks:**
- **Frontend** (`.githooks/pre-commit-frontend`) - ESLint, TypeScript, форматирование
- **Rust API** (`.githooks/pre-commit-rust`) - cargo clippy, cargo fmt, cargo test
- **Python** (`.githooks/pre-commit-python`) - ruff, black, pytest

### Примеры ошибок безопасности

```typescript
// ПЛОХО - коммит будет заблокирован
const JWT_SECRET = "my_super_secret_key_12345";
const apiKey = "sk-1234567890abcdef";

// ХОРОШО - используйте environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const apiKey = process.env.API_KEY;
```

```bash
# ПЛОХО - попытка закоммитить production .env
git add .env
git commit -m "Add config"
# [ERROR] Attempting to commit production .env file: .env

# ХОРОШО - используйте .env.example с placeholders
# .env.example
JWT_SECRET=changeme_generate_with_openssl_rand_base64_32
API_KEY=your_api_key_here
```

### Обход hooks (только для экстренных случаев)

```powershell
# Пропустить ВСЕ pre-commit проверки (не рекомендуется!)
git commit --no-verify -m "Emergency fix"

# Лучше: исправьте проблему и закоммитьте нормально
```

**ВНИМАНИЕ:** Использование `--no-verify` может привести к утечке секретов в репозиторий! Используйте только в критических ситуациях и обязательно проверьте изменения вручную.

### Генерация безопасных секретов

```powershell
# Windows, Linux, macOS
openssl rand -base64 32

# Пример вывода:
# xK9v2Lm+3Qw8Rp5Yt7Hn6Jk4Fg1Ds0Az9Cx8Bv7Nm5=
```

Используйте сгенерированные секреты в `.env` файле (но НЕ коммитьте `.env`!).

## Кому и зачем
- **Ученики** систематизируют знания «от простого к сложному», набирают ≥80 % правильных ответов, чтобы двигаться по темам, и мотивируются за счёт достижений и рейтингов.
- **Учителя и кураторы** отслеживают прогресс групп, находят уязвимые темы и готовят подборки заданий.
- **Администраторы контента** управляют банком шаблонов, запускают перепроверку эмбеддингов и следят за качеством правил.
- **DevOps/поддержка** мониторят инциденты и античит-события, управляют деплоем и системными метриками.

Детали предметной области, ролей и ограничений описаны в `requirements/предметная%20область.md` и глоссарии `requirements/глоссарий.md`.

## Игровая механика
- На игру отбирается 5–20 заданий по выбранной теме, тип задания определяет таймер (45 / 90 / 180 секунд) и стоимость подсказок (`sources/паспорт.md`, `requirements/сценарии/требования.md`).
- Правильный ответ = +10 баллов, с 4-го верного подряд добавляется бонус +5 (итого +15), подсказка стоит −5 баллов ещё до ответа, промах обнуляет серию.
- Для перехода на следующий уровень нужно ≥80 % правильных ответов, уровни можно перепроходить, сохраняя лучшую статистику.
- Доступно максимум 2 подсказки на уровень; система античита отслеживает слишком быстрые ответы, повторяющиеся паттерны и может блокировать пользователя.

### Горячие клавиши

- `Ctrl+Enter` — отправить ответ из текстового поля (работает всегда).
- `S` — отправить ответ, когда фокус вне текстового поля (включается при `VITE_FEATURE_HOTKEYS=true`).
- `H` — запросить подсказку без клика по кнопке (также требует включённого фич-флага).
- `Esc` — закрыть окно onboarding или свернуть панель конфликтов.

Если горячие клавиши мешают браузерным сочетаниям, оставьте `VITE_FEATURE_HOTKEYS` пустым или `false` — UI продолжит работать только с мышью/клавиатурой.

## Ключевые продуктовые сценарии
Business Layer сценарии (`requirements/архитектура/описание%20AL.md`) охватывают:
- **AL‑1** — прохождение урока (создание сессии, таймер, серия, расчёт прогресса).
- **AL‑2** — выдача подсказок и пояснений (ограничения, штрафы, интеграция с YandexGPT).
- **AL‑3** — аналитика и отчётность (ученики, группы, экспорты).
- **AL‑4** — античит и инциденты (детекторы, блокировки, уведомления).
- **AL‑5** — интеграция со школьными системами (SSO, синхронизация расписаний).

Каждый сценарий связан с прикладным (`requirements/архитектура/описание%20BL.md`) и технологическим (`requirements/архитектура/описание%20TL.md`) слоями, а также сущностями из `requirements/архитектура/сущности%20архитекутры.md`.

## Архитектура и стек
- **PWA** на TypeScript + нативные Web Components, собирается esbuild/Vite, работает офлайн через Service Worker (`requirements/структураПО/стек%20проекта.md`).
- **Rust API** (axum, tokio, serde) отвечает за сессии, таймеры, начисление баллов, anti-cheat и Reporting API.
- **Python 3.14 сервис** занимается генерацией заданий, объяснений, морфологией и пайплайном эмбеддингов (YandexGPT + Qdrant).
- **Хранилища:** MongoDB (темы, попытки, отчёты), Redis (сессии, лимиты, античит), Qdrant (векторы правил/примеров), Object Storage для бэкапов (`requirements/струтура%20Данных/описани%20БД.md`).
- **Инфраструктура:** Docker, docker-compose для локальной работы, Kubernetes/YaCloud + GitHub Actions, Vault, Prometheus/Grafana/Loki. Сетевые порты и политики описаны в `requirements/структураПО/ports.md`.

Согласованная структура репозитория и каталогов лежит в `requirements/структураПО/файловая%20структура%20проекта.md`.

## Требования и качество
- Полный комплект функциональных и нефункциональных требований, соответствующий ГОСТ и ISO/IEC/IEEE 29148:2018, находится в `requirements/сценарии/требования.md`.
- Стратегия тестирования (`requirements/тестирование/стек%20тестов.md`) покрывает unit, contract, e2e, performance, security и regression уровни для PWA, Rust API, Python-сервиса, Mongo/Redis/Qdrant.
- План системных/приёмочных испытаний (`requirements/тестирование/испытание%20системы.md`) описывает окружения, роли участников, входные/выходные критерии и ключевые сценарии (например, SYS‑01…SYS‑12).

## Данные и интеграции
- Подробные схемы MongoDB коллекций, ключей Redis и коллекций Qdrant находятся в `requirements/струтура%20Данных/описани%20БД.md`.
- Интеграция с YandexGPT и другими внешними API (SSO, SMTP, Telegram Bot API) описана в `requirements/структураПО/зависимости.md` и `requirements/архитектура/описание%20TL.md`.
- Античит хранит журналы инцидентов (`incidents`), счётчики Redis `anticheat:{user_id}` и использует Redis Streams для уведомлений DevOps (см. `requirements/архитектура/описание%20AL.md` и TL-2/TL-4).

## Локальный запуск (план MVP)
1. Подготовьте окружение: Node.js 24.x, Rust 1.89+, Python 3.14, Docker Engine 24+ (`requirements/структураПО/зависимости.md`).
2. Разверните инфраструктуру через будущий `infra/docker-compose.yml`, включающий MongoDB, Redis, Qdrant и сервисы (см. `requirements/структураПО/файловая%20структура%20проекта.md`).
3. Соберите фронтенд (`frontend/`), запустив тесты через `vitest` и `@web/test-runner`; для прод-сборки используйте esbuild/Vite.
4. Соберите и поднимите Rust API (`backend/rust-api/`) и Python generator (`backend/python-generator/`), подключив `.env` из `.env.example`.
5. Прогоните unit/integration тесты (Rust `cargo test`, Python `pytest`, фронт `npm test`) и smoke/E2E (Playwright) согласно `requirements/тестирование/стек%20тестов.md`.

## Документация в репозитории
- `requirements/глоссарий.md` — терминология и определения.
- `requirements/предметная%20область.md` — контекст, заинтересованные стороны и процессы.
- `requirements/обоснование%20выбора.md` — альтернативные стеки и критерии выбора технологий.
- `requirements/архитектура/` — описания AL/BL/TL сценариев, сущности, связи.
- `requirements/структураПО/` — стек проекта, зависимости, структура файлов, сетевые порты.
- `requirements/струтура%20Данных/описани%20БД.md` — модели данных MongoDB/Redis/Qdrant.
- `requirements/сценарии/требования.md` — формализованное ТЗ.
- `requirements/тестирование/` — стратегия тестов и план испытаний.
- `docs/offline-sync.md` — устройство offline‑очереди, конфликты и диагностика.
- `docs/pwa-deployment.md` — чеклист сборки и выката PWA, запуск Lighthouse/a11y.

Обновление README происходит вместе с изменениями в этих документах, чтобы новые участники могли быстро понять состояние проекта и найти актуальные спецификации.
