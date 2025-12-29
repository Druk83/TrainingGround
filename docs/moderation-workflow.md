# Процесс модерации шаблонов

1. **Автор** создаёт шаблон → статус `draft`.
2. **Автор** отправляет шаблон `/templates/:id/submit` → статус `pending_review`.
3. **Модератор 1** (`reviewed_once`): вызывает `/templates/:id/approve` → статус `reviewed_once`.
4. **Модератор 2** (`ready`): повторно `/templates/:id/approve` → статус `ready`.
5. **Администратор** публикует `/templates/:id` (PATCH status=`published`) → `content:changes` сигнализирует о rebuild.
6. При отклонении `/templates/:id/reject` возвращает в `draft` и создаёт новую версию через `template_versions`.

Дополнительно:
- `/templates/:id/versions` показывает историю.
- `/templates/:id/revert` возвращает заданную версию и обновляет `status`.
