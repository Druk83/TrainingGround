# Связи между слоями AL, BL и TL (ArchiMate 3.2)

Документ связывает бизнес-, прикладные и технологические сущности проекта «Русский язык: тренировочный полигон». Для каждого сценария указываются цепочки реализаций (Business Service → Application Service → Technology Node) и ключевые коммуникации. Используются сущности из документов «Сущности архитектуры», «Описание AL», «Описание BL», «Описание TL».

---

## 1. Матрица соответствия (Business Service → Application Service → Technology Node)

| Business Service | Application Service | Technology Node / Infrastructure |
|------------------|---------------------|----------------------------------|
| Прохождение урока | Lesson Execution, Session Management | PWA Client Device + CDN, Rust API Node, MongoDB Replica Set, Redis Cluster |
| Выдача подсказок | Hint Delivery, Explanation, Knowledge Embedding | PWA Device, Rust API Node, Python Generator Node, Qdrant Cluster, MongoDB |
| Аналитика и отчётность | Reporting & Analytics | PWA Device (Teacher Dashboard), Rust API Node, Analytics Worker Node, MongoDB, Object Storage |
| Модерация контента | Template Provisioning, Knowledge Embedding | Admin Console (PWA), Rust API Node, Python Generator Node, MongoDB, Qdrant |
| Инцидент-менеджмент / античит | Admin/Governance, Monitoring & Analytics | Rust API Node, Redis Cluster (античит), Monitoring Stack Node |
| Интеграция со школьными системами *(опц.)* | External Integration Service | Rust API Node, SSO Adapter, School Identity Provider |

---

## 2. Связи по сценариям (AL ↔ BL ↔ TL)

### Сценарий «Прохождение уровня»

- **AL:** Ученик ↔ Сервис «Прохождение урока» ↔ Процесс «Прохождение уровня».
- **BL:** Lesson Player + Session Manager + Answer Checker + Scoring Engine.
- **TL:** PWA device ↔ CDN ↔ Rust API Node ↔ MongoDB/Redis.
- **Коммуникации:** HTTPS (PWA→API), SSE/WebSocket (таймеры), Internal network (API→DB/Cache).
- **Примечания:** Business KPI (85 % верных) обеспечивается BL сервисами (Lesson Execution/Scoring) и TL SLA (latency, доступность).

### Сценарий «Выдача подсказок»

- **AL:** Сервис «Выдача подсказок» в рамках процесса «Прохождение уровня».
- **BL:** Hint Service, Explanation Builder, Embedding Pipeline.
- **TL:** Rust API Node ↔ Python Generator Node ↔ Qdrant ↔ MongoDB; Redis для лимитов.
- **Коммуникации:** REST (`/hints`), gRPC/REST (Rust↔Python), Qdrant API 6333, Redis 6379.
- **Зависимость:** Business правило «≤2 подсказок» реализовано через BL (лимиты) и TL (Redis, SLA 1.5 сек).

### Сценарий «Аналитика и отчётность»

- **AL:** Куратор ↔ Сервис «Аналитика и отчётность» ↔ Процесс «Генерация отчётов».
- **BL:** Teacher Dashboard, Reporting API, Analytics Worker.
- **TL:** PWA device ↔ Rust API Node ↔ MongoDB, Object Storage, Analytics Worker Node.
- **Коммуникации:** REST (`/stats`), internal pipeline (batch jobs), signed URLs.
- **Зависимость:** SLA 5–10 сек обеспечивается Aggregation Pipeline + Materialized views на Mongo.

### Сценарий «Модерация контента»

- **AL:** Администратор контента ↔ Сервис «Модерация контента» ↔ Процесс «Модерация шаблонов».
- **BL:** Admin Console, Template Generator, Embedding Pipeline.
- **TL:** PWA device ↔ Rust API Node ↔ Python Generator Node ↔ Mongo/Qdrant ↔ Object Storage (snapshots).
- **Коммуникации:** REST Admin API, Change Streams, Redis Streams, Qdrant API.
- **Зависимость:** Business SLA «публикация ≤15 мин» зависит от TL (pipeline, autoscaling).

### Сценарий «Инцидент-менеджмент»

- **AL:** Техподдержка ↔ Сервис «Инцидент-менеджмент и античит».
- **BL:** Admin Console (инциденты), Analytics Worker (античит), Monitoring Service.
- **TL:** Rust API Node (античит счётчики), Redis, Monitoring Stack (Prometheus, Loki).
- **Коммуникации:** Metrics endpoints (Prometheus), Webhooks в мессенджер, Redis Streams.
- **Зависимость:** SLA «реакция ≤2 часа» поддержана Alertmanager (TL) и административными интерфейсами (BL).

---

## 3. Потоки данных и коммуникаций

| Поток | Описание | Слои |
|-------|----------|------|
| `PWA → Rust API` | Все пользовательские действия (уроки, подсказки, отчёты). | AL (Ученик) → BL (Lesson Player) → TL (HTTPS через CDN). |
| `Rust API → Mongo/Redis` | CRUD операций над шаблонами, статистикой, сессиями. | BL (Session Manager, Scoring) → TL (MongoDB Replica Set, Redis). |
| `Rust API → Python сервис` | Проверка ответов, генерация пояснений (gRPC/REST). | BL (Answer Checker, Hint Service) ↔ TL (Internal Service Network, Python Node). |
| `Python → Qdrant` | Загрузка/поиск эмбеддингов. | BL (Embedding Pipeline, Explanation Builder) → TL (Qdrant Cluster). |
| `Analytics Worker → Object Storage` | Экспорт отчётов, snapshot Qdrant. | BL (Reporting) → TL (Object Storage Node). |
| `Monitoring → Alerting` | Сбор метрик, логов, алерты. | BL (Monitoring service) → TL (Prometheus, Grafana, Loki). |

---

## 4. Требования к сквозным SLA

| Показатель | AL/BL обоснование | TL обеспечение |
|------------|------------------|----------------|
| Latency API ≤ 200 мс | BL сценарии (Lesson Execution, Hint Delivery) требуют быстрой реакции. | TL обеспечивает через масштабирование Rust API, Redis кешей, оптимизацию Mongo. |
| Выдача подсказки ≤ 1.5 сек | AL политика ограничений и UX. | TL (Python/Qdrant) должены иметь достаточно ресурсов, кэш на Redis, быстрые сети. |
| Отчёт для класса ≤ 10 сек | AL KPI для кураторов. | BL Reporting использует агрегаты; TL — шардирование Mongo, выделенный worker. |
| Публикация контента ≤ 15 мин | AL SLA модерации. | TL pipeline (autoscaling workers, Redis queue, Qdrant snapshot). |
| Реакция на инцидент ≤ 2 часа | AL требование античита. | BL Admin/Monitoring, TL Alertmanager + дежурство DevOps. |

---

## 5. Общая схема реализации (ArchiMate viewpoint)

1. **Business Layer** определяет «что» нужно пользователям (ученики, кураторы, администраторы) — сервисы обучения, аналитики, модерации, инцидентов.
2. **Application Layer** реализует эти сервисы через компоненты (PWA, Rust API, Python генератор, Qdrant integration) и управляет данными.
3. **Technology Layer** обеспечивает выполнение приложений: контейнеры, базы данных, кэш, векторную СУБД, мониторинг, CI/CD.
4. Связи AL↔BL↔TL подтверждаются в матрице соответствий и сценариях; при изменении любого элемента должно быть пересмотрено влияние на соседние слои.

Документ используется для проектирования диаграмм «Layered View» и для контроля влияния изменений в одном слое на другие.
