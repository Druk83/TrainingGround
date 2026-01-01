# Template Generator - Генератор заданий

## Обзор

Template Generator - это компонент системы, который генерирует уникальные экземпляры заданий (Task Instances) из параметризованных шаблонов (Task Templates). Сервис реализован на Python и интегрирован с Rust Session Manager через REST API.

## Архитектура

### Компоненты

1. **Template Engine** - парсер и рендерер шаблонов с морфологическим анализом
2. **Word Bank** - банк словоформ из MongoDB коллекции `word_forms`
3. **Example Bank** - банк примеров из MongoDB коллекции `example_sentences`
4. **Template Repository** - загрузка шаблонов из MongoDB коллекции `templates`
5. **Redis Cache** - кэширование и дедупликация

### Поток данных

```
Rust Session Manager → POST /internal/generate_instances
                     ↓
        TemplateGeneratorService
                     ↓
        TemplateRepository (MongoDB)
                     ↓
        TemplateEngine + WordBank + ExampleBank
                     ↓
        Redis Cache (TTL 10 мин)
                     ↓
        Task Instances → Response
```

## Синтаксис шаблонов (DSL)

Template Engine использует синтаксис с двойными фигурными скобками `{{...}}`.

### 1. Параметры слов (Word Parameters)

#### Формат
```
{{word:pos:case:number}}
```

#### Части речи (pos)
- `noun` - существительное
- `verb` - глагол
- `adjective` - прилагательное
- `adverb` - наречие
- `pronoun` - местоимение
- `numeral` - числительное

#### Падежи (case)
- `nominative` (nom, nomn) - именительный (кто? что?)
- `genitive` (gen, gent) - родительный (кого? чего?)
- `dative` (dat, datv) - дательный (кому? чему?)
- `accusative` (acc, accs) - винительный (кого? что?)
- `instrumental` (ins, ablt) - творительный (кем? чем?)
- `prepositional` (loc, loct) - предложный (о ком? о чем?)

#### Число (number)
- `singular` (sing) - единственное число
- `plural` (plur) - множественное число

#### Примеры

```
Проверка: {{word:noun:nominative:singular}}.
→ Проверка: ученик.

Нет {{word:noun:genitive:singular}}.
→ Нет ученика.

Дать {{word:noun:dative:plural}}.
→ Дать ученикам.

Вижу {{word:noun:accusative:singular}}.
→ Вижу ученика.

Доволен {{word:noun:instrumental:singular}}.
→ Доволен учеником.

Думаю о {{word:noun:prepositional:plural}}.
→ Думаю об учениках.
```

### 2. Примеры предложений (Example Sentences)

#### Формат
```
{{example}}
```

Возвращает случайное предложение из коллекции `example_sentences`.

#### Пример
```
Исправьте ошибку в предложении: {{example}}
→ Исправьте ошибку в предложении: В лесу росли высокие деревья.
```

### 3. Числа (Numbers)

#### Формат
```
{{number}}
{{number:min:max}}
```

Генерирует случайное число. Без параметров - от 1 до 100.

#### Примеры
```
Найдите {{number}} ошибок.
→ Найдите 42 ошибок.

Выберите число от {{number:10:50}}.
→ Выберите число от 27.
```

### 4. Варианты ответов (Options)

#### Формат
```
{{option}}
{{option:N}}
```

Возвращает вариант из списка `params.options` в шаблоне. Без индекса - случайный вариант.

#### Пример
```
Template в MongoDB:
{
  "content": "Выберите правильный вариант: {{option:0}}",
  "params": {
    "options": ["правильно", "неправильно", "не знаю"]
  }
}

Результат:
→ Выберите правильный вариант: правильно
```

## Структура шаблона в MongoDB

### Коллекция `templates`

```javascript
{
  "_id": ObjectId("..."),
  "slug": "orthography-noun-case-1",
  "level_id": "lvl-orthography-1",
  "topic": "orthography",
  "difficulty": "A1",
  "content": "Выберите правильную форму слова в {{word:noun:genitive:singular}} падеже.",
  "params": {
    "type": "mcq",
    "options": ["ученика", "ученик", "ученику"],
    "hint_template": "Это родительный падеж (кого? чего?)"
  },
  "metadata": {
    "correct_answer": "ученика",
    "rule_ids": [ObjectId("...")],
    "source_refs": ["НКРЯ"],
    "pii_flags": []
  },
  "status": "ready",
  "created_at": ISODate("2025-12-01T00:00:00Z"),
  "updated_at": ISODate("2025-12-01T00:00:00Z")
}
```

### Поля

- `slug` - уникальный идентификатор (латиница, дефисы)
- `level_id` - идентификатор уровня сложности
- `topic` - тема задания (orthography, syntax, punctuation)
- `difficulty` - уровень сложности (A1, A2, B1, B2)
- `content` - текст шаблона с параметрами
- `params.type` - тип задания (mcq, text_input, true_false)
- `params.options` - варианты ответов для MCQ
- `params.hint_template` - шаблон подсказки
- `metadata.correct_answer` - правильный ответ
- `metadata.rule_ids` - связанные правила грамматики
- `status` - статус шаблона (draft, ready, archived)

## API эндпоинты

### POST /internal/generate_instances

Генерирует экземпляры заданий из шаблонов.

#### Request

```json
{
  "level_id": "lvl-orthography-1",
  "count": 20,
  "user_id": "user-123"
}
```

#### Response

```json
{
  "instances": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "Выберите правильную форму слова в родительном падеже.",
      "correct_answer": "ученика",
      "options": ["ученика", "ученик", "ученику"],
      "metadata": {
        "template_id": "orthography-noun-case-1",
        "level_id": "lvl-orthography-1",
        "rule_ids": ["..."],
        "source_refs": ["НКРЯ"]
      }
    }
  ]
}
```

#### Параметры

- `level_id` - обязательный, идентификатор уровня
- `count` - количество экземпляров (по умолчанию 1, максимум из настроек)
- `user_id` - опциональный, для дедупликации

## Интеграция с Rust API

### Session Manager

Session Manager вызывает Template Generator при создании сессии.

#### Создание сессии с генерацией

```rust
// В CreateSessionRequest добавлено поле level_id
pub struct CreateSessionRequest {
    pub user_id: String,
    pub task_id: String,           // fallback задание
    pub group_id: Option<String>,
    pub level_id: Option<String>,  // для Template Generator
}
```

#### Fallback механизм

```rust
pub async fn create_session(&self, req: CreateSessionRequest) -> Result<CreateSessionResponse> {
    let task = if let Some(ref level_id) = req.level_id {
        // Попытка генерации через Template Generator
        match self.generate_and_store_task(level_id, &req.user_id).await {
            Ok(generated_task) => generated_task,
            Err(e) => {
                // Fallback на готовое задание из MongoDB
                self.fetch_task(&req.task_id).await?
            }
        }
    } else {
        // Без level_id используем готовое задание
        self.fetch_task(&req.task_id).await?
    };
    // ... создание сессии
}
```

#### HTTP клиент

```rust
async fn generate_task_instances(
    &self,
    level_id: &str,
    count: usize,
    user_id: &str,
) -> Result<Vec<GeneratedTaskInstance>> {
    let url = format!("{}/internal/generate_instances", self.python_api_url);
    let request_body = json!({
        "level_id": level_id,
        "count": count,
        "user_id": user_id,
    });

    let response = self.http_client
        .post(&url)
        .json(&request_body)
        .timeout(Duration::from_secs(5))
        .send()
        .await?;

    let response_data: GenerateInstancesResponse = response.json().await?;
    Ok(response_data.instances)
}
```

## Кэширование и дедупликация

### Redis ключи

#### 1. Кэш экземпляров
```
template:instances:{template_id}
TTL: 10 минут (600 секунд)
```

Хранит JSON с последним сгенерированным экземпляром для переиспользования.

Структура:
```json
{
  "text": "Выберите правильную форму...",
  "correct_answer": "ученика",
  "options": ["ученика", "ученик", "ученику"]
}
```

#### 2. Дедупликация пользователей
```
seen_tasks:{user_id}
TTL: 24 часа (86400 секунд)
Тип: SET
```

Хранит множество `template_id`, которые уже были показаны пользователю.

### Логика дедупликации

```python
async def generate_instances(self, payload: GenerateInstancesRequest) -> GenerateInstancesResponse:
    templates = await self._repository.list_ready_templates(payload.level_id)
    instances = []
    seen_templates = await self._load_seen_templates(payload.user_id)

    for template in templates:
        if len(instances) >= payload.count:
            break
        # Пропускаем уже показанные шаблоны
        if payload.user_id and template.template_id in seen_templates:
            continue

        instance = await self._build_instance(template, payload.user_id)
        instances.append(instance)
        seen_templates.add(template.template_id)

    return GenerateInstancesResponse(instances=instances)
```

## Морфологический анализ

### Библиотеки

- **pymorphy2** - основная библиотека для морфологии русского языка
- **natasha** - дополнительный инструмент для NLP

### Поддерживаемые формы

Template Engine корректно обрабатывает:

1. Все 6 падежей русского языка
2. Единственное и множественное число
3. Род (мужской, женский, средний)
4. Одушевленность/неодушевленность

### Примеры трансформаций

```python
# Именительный → Родительный
"ученик" → "ученика"
"книга" → "книги"
"окно" → "окна"

# Единственное → Множественное
"ученик" (nom, sing) → "ученики" (nom, plur)
"ученика" (gen, sing) → "учеников" (gen, plur)
```

## MongoDB коллекции

### word_forms

Коллекция словоформ с морфологическим разбором.

```javascript
{
  "_id": ObjectId("..."),
  "word": "ученика",
  "lemma": "ученик",
  "pos": "noun",
  "grammemes": {
    "case": "gent",
    "number": "sing",
    "gender": "masc",
    "animacy": "anim"
  },
  "frequency": 100
}
```

Индексы:
- `{ pos: 1 }`
- `{ lemma: 1 }`
- `{ pos: 1, lemma: 1 }`
- `{ frequency: -1 }`

### example_sentences

Коллекция примеров предложений.

```javascript
{
  "_id": ObjectId("..."),
  "text": "В лесу росли высокие деревья.",
  "topic": "orthography",
  "level": "A1",
  "tags": ["природа", "деревья"],
  "source": "НКРЯ"
}
```

Индексы:
- `{ topic: 1 }`
- `{ level: 1 }`
- `{ tags: 1 }`

## Тестирование

### Unit тесты

Файл: `tests/test_template_generator.py`

Покрытие:
- Все 6 падежей в единственном числе
- Все 6 падежей во множественном числе
- Алиасы падежей (nom, gen, dat, acc, ins, loc)
- Параметры number, example, option

### Integration тесты

Файл: `tests/test_template_integration.py`

Сценарии:
- Генерация из реальных MongoDB шаблонов
- Уникальность 100 экземпляров из 10 шаблонов
- Дедупликация для пользователя
- Загрузка Word Bank и Example Bank из MongoDB

### Performance тесты

Файл: `tests/test_template_performance.py`

SLA:
- Генерация 20 экземпляров за 1 запрос ≤ 2 секунды
- Параллельная генерация 100 экземпляров ≤ 3 секунды
- Кэш ускоряет повторные запросы в 10+ раз
- Stress test: 1000 экземпляров последовательно

## Настройки

### Переменные окружения

```bash
# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=training_ground

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Template Generator
TEMPLATE_GENERATION_LIMIT=50              # Макс. количество за запрос
TEMPLATE_INSTANCE_CACHE_TTL_SECONDS=600   # TTL кэша экземпляров (10 мин)
TEMPLATE_SEEN_TASKS_TTL_SECONDS=86400     # TTL дедупликации (24 часа)
```

### pyproject.toml

```toml
[project]
dependencies = [
  "fastapi>=0.115",
  "motor>=3.5",
  "redis>=7.1.0",
  "pymorphy2>=0.9",
  "natasha>=1.6",
]
```

## Примеры использования

### Создание шаблона через Admin API

```bash
POST /admin/templates
{
  "slug": "orthography-noun-genitive-1",
  "level_id": "lvl-orthography-1",
  "topic": "orthography",
  "difficulty": "A1",
  "content": "Найдите слово в родительном падеже: {{word:noun:genitive:singular}}",
  "params": {
    "type": "text_input",
    "hint_template": "Это форма (кого? чего?)"
  },
  "metadata": {
    "correct_answer": "{{word:noun:genitive:singular}}",
    "rule_ids": ["rule-genitive-case"]
  },
  "status": "ready"
}
```

### Генерация через Rust API

```bash
POST /api/sessions
{
  "user_id": "user-123",
  "task_id": "fallback-task-id",
  "level_id": "lvl-orthography-1"  // Триггер Template Generator
}
```

### Прямой вызов Python API

```bash
POST http://localhost:8001/internal/generate_instances
{
  "level_id": "lvl-orthography-1",
  "count": 10,
  "user_id": "user-123"
}
```

## Troubleshooting

### Проблема: "No ready templates found"

Причина: В MongoDB нет шаблонов со статусом `ready` для указанного `level_id`.

Решение:
```javascript
// Проверить шаблоны
db.templates.find({ level_id: "lvl-orthography-1", status: "ready" })

// Изменить статус
db.templates.updateMany(
  { level_id: "lvl-orthography-1" },
  { $set: { status: "ready" } }
)
```

### Проблема: "All templates were already shown"

Причина: Все шаблоны уже были показаны пользователю в течение 24 часов.

Решение:
```bash
# Очистить кэш дедупликации для пользователя
redis-cli DEL seen_tasks:user-123
```

### Проблема: Медленная генерация

Причина: Нет индексов в MongoDB или Redis недоступен.

Решение:
```javascript
// Создать индексы
db.templates.createIndex({ level_id: 1, status: 1 })
db.word_forms.createIndex({ pos: 1, frequency: -1 })
```

## Ссылки

- Задача: `tasks/A9.md`
- Архитектура: `requirements/архитектура/описание BL.md`
- MongoDB модели: `infra/mongo-init/01_init_db.js`
- Seed данные: `infra/mongo-init/02_seed_data.js`
- API спецификация: `backend/rust-api/src/handlers/sessions.rs`
