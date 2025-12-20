# Описание BL-сценариев (Application Layer, ArchiMate 3.2)

Документ описывает ключевые прикладные сценарии системы «Русский язык: тренировочный полигон». Каждый сценарий связывает Application Components/Services/Interfaces/Data Objects и уточняет SLA. Сущности соответствуют документу «Сущности архитектуры».

---

## Сценарий 1. Прохождение уровня (Lesson Execution)

**Участники (Application Components):**
- PWA Shell + Lesson Player
- Session Manager (Rust)
- Scoring Engine (Rust)
- Answer Checker (Rust)
- Hint Service (Rust) *(при необходимости подсказок)*
- Reporting API (фиксация прогресса)

**Триггер:** Ученик выбирает тему и запускает уровень.

**Шаги:**
1. Lesson Player создаёт сессию через `POST /sessions` (REST). Session Manager резервирует задания (`Task Instance`) в MongoDB и сохраняет `session_id` в Redis.
2. Lesson Player подписывается на таймер через SSE/WebSocket. Длительность таймера зависит от типа задания (выбор: 45 сек, ввод: 90 сек, анализ: 180 сек). Session Manager эмитит события «timer-tick», «time-expired» с интервалом не более 200 мс.
3. Ученик отвечает на задание → Answer Checker получает `POST /sessions/{id}/answers`, валидирует ответ, анализирует античит-счетчики (Redis), возвращает статус (OK/Error/Timeout).
4. Scoring Engine применяет бизнес-правила: +10 за верный ответ, +15 за верный ответ начиная с 4-го подряд (базовые 10 + бонус 5), 0 за неверный. Подсказка стоит −5 баллов до ответа. Серия ведётся в Redis (`score:series:{user_id}`), операции выполняются атомарным Lua-скриптом и синхронизируются в MongoDB.
5. По завершении пакета Reporting API формирует итог (баллы, процент правильных, доступ к следующему уровню) и возвращает Lesson Player.

**Используемые Application Services:** Lesson Execution Service, Session Management Service, Answer Validation Service, Scoring Service, Reporting & Analytics Service.

**Интерфейсы:** REST/JSON API, SSE/WebSocket.

**Data Objects:** `Task Instance`, `Attempt Record`, `Hint Usage Log` (если подсказки), `Progress Summary`, `Anticheat Event`.

**SLA / NFR:**
- Создание сессии ≤ 3 сек.
- Проверка ответа ≤ 1 сек (p95).
- Таймерные event'ы без пропусков, задержка ≤ 200 мс.
- Античит-доступ к Redis ≤ 50 мс.

---

## Сценарий 2. Выдача подсказки и пояснения (Hint Delivery + RAG)

**Участники:**
- Lesson Player / Hint Panel
- Session Manager (контроль лимитов)
- Hint Service (Rust)
- Explanation Builder (Python)
- Embedding Pipeline / Qdrant (для поиска контекста)

**Триггер:** Ученик нажимает «Получить подсказку» внутри активной сессии.

**Шаги:**
1. Lesson Player вызывает `POST /sessions/{id}/hints`. Session Manager проверяет лимит (Redis: максимум 2 подсказки на уровень) и списывает 5 баллов перед выдачей ответа (Scoring Engine). Если подсказок больше нет, возвращает ошибку.
2. Hint Service обращается к MongoDB за правилом и к Explanation Builder через REST/gRPC (`/explanations`). Параметры: тема, тип задания, сделанные ошибки.
3. Explanation Builder выполняет запрос к Qdrant (HNSW) → выбирает k релевантных `Embedding Vector`, формирует контекст и, при необходимости, обращается к YandexGPT для генерации пояснения.
4. Готовая подсказка и пояснение кэшируются в Redis (TTL нескольких минут) и возвращаются Lesson Player. При таймауте Explanation API Hint Service возвращает статичное правило из MongoDB и пишет предупреждение в лог.
5. Hint Usage Log обновляется в MongoDB; Progress Summary фиксирует штраф.

**Application Services:** Hint Delivery, Explanation Service, Knowledge Embedding Service, Scoring Service.

**Интерфейсы:** REST API (`/sessions/{id}/hints`), внутренний REST/gRPC для генератора, Qdrant 6333.

**Data Objects:** `Hint Usage Log`, `Embedding Vector`, `Task Instance`, `Attempt Record`.

**SLA:** 
- Выдача подсказки ≤ 1.5 сек.
- Кэш попаданий ≥ 80 % повторных запросов в течение сессии.
- Лимиты подсказок проверяются ≤ 50 мс.

---

## Сценарий 3. Аналитика и отчёт для куратора (Group Analytics)

**Участники:**
- Teacher Dashboard (PWA)
- Reporting API (Rust)
- Analytics Worker (batch)
- MongoDB Aggregation Pipelines

**Триггер:** Куратор открывает страницу группы или запрашивает экспорт.

**Шаги:**
1. Teacher Dashboard запрашивает `GET /stats/groups/{id}?period=30d`.
2. Reporting API выполняет агрегации по коллекциям `Attempt Record` и `Progress Summary`, используя предвычисленные результаты от Analytics Worker (материализованные представления).
3. Ответ содержит KPI: % выполненных уроков, средний балл, частота подсказок, топ ошибок.
4. При запросе экспорта Dashboard вызывает `POST /stats/groups/{id}/export`, Reporting API инициирует batch на Analytics Worker, который сохраняет CSV/PDF в Object Storage и возвращает ссылку.

**Application Services:** Reporting & Analytics, Session Management (для RLS), Admin/Governance (контроль прав).

**Интерфейсы:** REST API, Storage Download link (signed URL).

**Data Objects:** `Progress Summary`, `Attempt Record`, `Report Export`.

**SLA:** 
- Ответ на UI-запрос ≤ 5 сек.
- Генерация отчёта класса (30 учеников) ≤ 10 сек.
- Экспорт доступен пользователю в течение 24 часов.

**Примечания:** RLS ограничивает доступ только к группам куратора. Используется OAuth/role claim.

---

## Сценарий 4. Модерация шаблонов и пересоздание эмбеддингов (Content Governance)

**Участники:**
- Admin Console (PWA)
- Template Generator (Python)
- Embedding Pipeline (Python)
- Admin API (Rust)
- MongoDB + Qdrant

**Триггер:** Администратор добавляет новый набор заданий или обновляет правило.

**Шаги:**
1. Admin Console отправляет `POST /admin/templates` (Admin API). В MongoDB создаётся новая версия `Template Catalog`, статус `draft`.
2. Template Generator проверяет шаблон (lint, тестовые подстановки), переводит в статус `ready`.
3. Админ запускает «Публиковать» → Admin API выставляет статус `published`, вызывает Embedding Pipeline (webhook/queue).
4. Embedding Pipeline считывает опубликованные документы, вычисляет эмбеддинги, записывает их в Qdrant, помечает старые версии как `deprecated`.
5. Session Manager получает событие (Mongo Change Stream) и обновляет кэш доступных заданий.

**Application Services:** Template Provisioning, Knowledge Embedding, Admin/Governance, External Integration (вебхуки).

**Интерфейсы:** Admin API (REST), Content Webhook, Qdrant API.

**Data Objects:** `Template Catalog`, `Embedding Vector`, `Feature Flag` (если запуск через флаги).

**SLA:** 
- Валидация шаблона ≤ 2 мин (включая генерацию тестовых заданий).
- Пересоздание эмбеддингов ≤ 15 мин на 1000 шаблонов.
- Распространение новых заданий в Session Manager < 5 мин после публикации.

**Примечания:** При ошибке Embedding Pipeline шаблон возвращается в `draft`, уведомление уходит в Admin Console и DevOps.

---

Сценарии BL служат основой для диаграмм взаимодействия (Application Collaboration) и увязываются с бизнес-сервисами и технологическими узлами в отдельных документах AL/TL.
