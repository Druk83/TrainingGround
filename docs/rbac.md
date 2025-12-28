# RBAC TrainingGround

Документ описывает роли и их разрешения, используемые в backend (`JwtClaims.role`) и фронтенде (`authService.hasAnyRole`).

## 1. Список ролей
| Роль            | Назначение                                |
|-----------------|--------------------------------------------|
| `student`       | Выполнение уроков, доступ к `/student-home`|
| `teacher`       | Мониторинг занятий, `/teacher-dashboard`   |
| `content_admin` | Управление шаблонами заданий               |
| `admin`         | Суперадминистратор (системные разделы)     |

## 2. Разрешения
| Раздел / API                                | student | teacher | content_admin | admin |
|---------------------------------------------|:-------:|:-------:|:-------------:|:-----:|
| `/admin/users/*`                            |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/groups/*`                           |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/settings/*`                         |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/audit/*`                            |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/anticheat/*`                        |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/backups/*`                          |   ✗     |   ✗     |       ✗       |  ✓    |
| `/admin/system/metrics`                     |   ✗     |   ✗     |       ✓*      |  ✓    |
| `/admin-console` (шаблоны, очередь)         |   ✗     |   ✗     |       ✓       |  ✓    |
| `/teacher-dashboard`                        |   ✗     |   ✓     |       ✗       |  ✓    |
| `/student-home`, уроки, API /lessons/*      |   ✓     |   ✓     |       ✓       |  ✓    |

`✓*` — контент-администратор видит системные метрики, но не может запускать бэкапы/изменять настройки.

## 3. Реализация
- **Backend**: middleware `admin_guard_middleware` проверяет `claims.role`. Для P1 эндпоинтов (`/admin/settings`, `/admin/audit`, `/admin/anticheat`, `/admin/backups`) используются отдельные маршруты в `handlers::admin::*`.
- **Frontend**: функция `requireRole` в `frontend/src/main.ts` выполняет редирект на `/forbidden`, если роль не входит в список, и скрывает навигацию в `<app-header>`.
- **JWT**: `models::user::UserResponse` сериализует `role` и `group_ids`, которые попадают в `JwtClaims` и доступны на фронте через `authService.getUser()`.

## 4. Как добавить новую роль
1. Обновить перечисление `UserRole` в `backend/rust-api/src/models/user.rs` и сериализацию.
2. Настроить выдачу роли в `UserManagementService` + миграции данных.
3. Дополнить middleware / guards на backend.
4. Обновить `authService.hasAnyRole`, `<app-header>` и маршруты в `frontend/src/main.ts`.

## 5. Тестирование
- Интеграционные тесты `admin_*_tests.rs` создают админа и проверяют доступ.
- Для smoke-теста можно вызвать `/admin/users` с токеном учителя — ожидаем 403.
