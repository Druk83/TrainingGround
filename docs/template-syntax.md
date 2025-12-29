## Синтаксис шаблонов заданий

### Структура
- `slug` – уникальный идентификатор латиницей и дефисами.
- `level_id`/`topic` – ObjectId уровня, определяется через `/admin/levels`.
- `rule_ids` – массив ObjectId правил.
- `difficulty` – один из `A1, A2, B1, B2`.
- `content` – текст задания, допускает параметры `{word:noun:genitive}`, `{number}`, `{option}`.
- `params` – JSON с `type`, `options`, `hint_template`, `explanation_template`.
- `metadata` – наполнен `correct_answer`, `pii_flags`, `source_refs`.

### Примеры параметров
- `type`: `mcq`, `text_input`, `true_false`.
- `options`: массив для MCQ.
- `hint_template`: `Найдите {word:noun:dative}`.
- `pii_flags`: `['email','name']`.

### Проверки
- Slug должен быть уникальным на уровне.
- Параметры и metadata валидируются через `/templates/validate`.
- Templates без правил не пройдут проверку.
