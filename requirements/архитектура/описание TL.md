# Описание технологических сценариев (Technology Layer, ArchiMate 3.2)

Документ фиксирует ключевые процессы технологического слоя для проекта «Русский язык: тренировочный полигон». Каждый сценарий описывает задействованные Technology Nodes, System Software, Communication Path и SLA. Сущности соотносятся с документом «Сущности архитектуры».

---

## TL-1. Доставка и обновление PWA

**Technology Nodes:**
- PWA Client Device (браузеры пользователей)
- CDN Edge (раздача статики)
- GitHub Actions Runner + Object Storage (артефакты)

**System Software / Artifacts:**
- PWA Bundle (JS/CSS + Service Worker)
- Dockerized build (Node.js + esbuild)
- TLS Termination (CDN/Ingress)

**Процесс:**
1. После мержа в main ветку GitHub Actions запускает пайплайн: lint → unit тесты → сборка PWA.
2. Готовый PWA Bundle загружается в Object Storage и синхронизируется с CDN Edge.
3. Service Worker versioning обеспечивает atomарное обновление: новый SW активируется после `skipWaiting`, пользователям показывается баннер «обновить».
4. Проверяется целостность (Subresource Integrity), проводится smoke-тест.

**Communication Paths:** HTTPS 443 между CDN ↔ пользователями.

**SLA / NFR:**
- Время доставки обновления ≤ 15 минут после мержа.
- Cache invalidation на CDN ≤ 5 минут.
- PWA cold start ≤ 2 сек на 4G.

---

## TL-2. Работа Rust API и внутренняя сеть

**Technology Nodes:**
- Rust API Node (Docker/Kubernetes pod)
- MongoDB Replica Set
- Redis Cluster
- Qdrant Cluster (для обращений API → Qdrant, если требуется)

**System Software:**
- Docker Engine / Container Orchestrator
- Nginx/Ingress Controller
- TLS 1.3 termination

**Процесс:**
1. Ingress принимает HTTPS-запросы, проксирует их на Rust API pods.
2. Pod поддерживает пул соединений к MongoDB/Redis/Qdrant внутри частной сети.
3. Redis хранит кэш сессий (ключ `session:{id}`, TTL 3600 сек), таймеры заданий (ключ `session:timer:{id}`, TTL 45-180 сек в зависимости от типа задания) и античит-счетчики; MongoDB — основную модель, Qdrant — векторные данные.
4. Horizontal Pod Autoscaler следит за CPU/latency (Prometheus metrics) и масштабирует pods.
5. Rolling update выполняется через Kubernetes/YaCloud: новые pods проходят readiness + liveness probes.

**Communication Paths:** Internal Service Network (mTLS), MongoDB 27017, Redis 6379, Qdrant 6333.

**SLA / NFR:**
- API latency p95 ≤ 200 мс.
- Доступность Rust API ≥ 99.5 % в учебное время.
- Liveness probe ≤ 10 сек, readiness − до 5 сек.

---

## TL-3. Pipeline генерации и эмбеддингов (Python + Qdrant)

**Technology Nodes:**
- Python Generator Node
- MongoDB Replica Set
- Qdrant Cluster
- Redis Cluster (очереди задач)

**System Software / Artefacts:**
- Python 3.12 runtime (`asyncio`, `pymorphy2`, `sentence-transformers`)
- Docker image `generator:latest`
- Qdrant (HNSW)

**Процесс:**
1. Admin API публикует шаблон → Mongo Change Stream отправляет событие в Redis Stream `content:changes`.
2. Embedding Pipeline worker (Python) читает событие, загружает документ из MongoDB, рассчитывает эмбеддинг.
3. Worker пишет в Qdrant коллекцию (`rules_embeddings`, `examples_embeddings`) и помечает старую версию как deprecated.
4. Snapshot Qdrant создаётся ежедневно и сохраняется в Object Storage; при недоступности Qdrant сервисы переключаются на fallback (MongoDB шаблоны) до восстановления snapshot.
5. При масштабировании воркеры горизонтально увеличиваются (K8s Deployment / autoscaler).

**Communication Paths:** REST/gRPC Python ↔ Qdrant, Redis Streams 6379.

**SLA / NFR:**
- Обработка одного шаблона ≤ 1 мин (в среднем).
- Очередь изменений не должна превышать 100 элементов (иначе алерт).
- Восстановление Qdrant из snapshot ≤ 15 мин.

---

## TL-4. Мониторинг, логирование и алертинг

**Technology Nodes:**
- Monitoring Stack Node (Prometheus, Grafana, Alertmanager)
- Logging Stack (Loki/ELK)
- Rust/Python/PWA сервисы с агентами

**System Software:**
- Prometheus exporters (`node_exporter`, custom metrics)
- Loki/Fluent Bit
- Grafana dashboards

**Процесс:**
1. Rust API и Python-сервисы экспонируют /metrics и логи через stdout → Loki/Fluent Bit.
2. Prometheus собирает метрики, Alertmanager анализирует правила (latency > 200 мс, ошибки генерации > 2 %, очередь эмбеддингов > N).
3. Grafana отображает дашборды (SLA, anti-cheat events, usage).
4. При срабатывании алерта отправляется уведомление (Telegram, email) и создаётся тикет в issue tracker.

**Communication Paths:** HTTP 9100/9090/3100 внутренняя сеть; Webhook в мессенджер.

**SLA / NFR:**
- Потеря метрик ≤ 1 % (при сбоях).
- Время доставки критического алерта ≤ 2 мин.
- Retention логов ≥ 30 дней.

---

## TL-5. CI/CD и управление конфигурациями

**Technology Nodes:**
- GitHub Actions Runner
- Docker Registry
- Vault/Secrets Manager
- Configuration Repository (Git)

**System Software / Services:**
- GitHub Actions, docker buildx
- HashiCorp Vault (KV), YaCloud Secrets *(если используется)*
- Terraform/Helm/Ansible (IaC)

**Процесс:**
1. Разработчик открывает PR. CI выполняет lint/test/build. При успехе — собираются Docker images (frontend, rust-api, python-generator).
2. Images пушатся в реестр, тегируются по версии.
3. CD (GitHub Actions → Kubernetes/YaCloud) применяет IaC (Helm/Terraform), подтягивает секреты из Vault.
4. Config Service (ENV/ConfigMap) обновляется централизованно, feature flags (Mongo/Redis) переключаются через Admin Console.
5. После деплоя выполняются smoke-тесты и проверяется обратная совместимость.

**Communication Paths:** HTTPS (CI ↔ registry), SSH/HTTPS (IaC → кластер), API Vault.

**SLA / NFR:**
- Среднее время CI/CD пайплайна ≤ 15 мин.
- Rollback возможен ≤ 10 мин (хранение предыдущих Helm release).
- Secret rotation без простоя (двойная запись).

---

Сценарии TL обеспечивают выполнение требований AL/BL. Они служат основой для диаграмм Deployment/Infrastructure и для процедур эксплуатации.
