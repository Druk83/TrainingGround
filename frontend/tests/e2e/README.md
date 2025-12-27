# E2E тесты - Аутентификация и авторизация

Эта директория содержит end-to-end тесты для функций аутентификации и авторизации с использованием Playwright.

## Файлы тестов

### `auth.spec.ts`
Тестирует основные потоки аутентификации:
- Регистрация пользователя с уникальным email
- Вход с существующим аккаунтом
- Неудачный вход с неверным паролем
- Редирект на страницу входа при доступе к защищенным маршрутам без авторизации
- Выход пользователя и очистка сессии
- Блокировка аккаунта после 5 неудачных попыток входа (rate limiting)

### `role-based-access.spec.ts`
Тестирует role-based access control (RBAC):
- Студент может получить доступ к главной странице студента
- Студент не может получить доступ к админ-консоли (403 Forbidden)
- Студент не может получить доступ к дашборду учителя (403 Forbidden)
- Студент может получить доступ к странице профиля
- Навигационное меню адаптируется в зависимости от роли пользователя
- Тесты для учителя (пропущены - требуется предзаполненная база данных)
- Тесты для администратора (пропущены - требуется предзаполненная база данных)

### `security.spec.ts`
Тестирует функции безопасности:
- CSRF токен получается после входа
- CSRF токен отправляется в POST запросах (заголовок X-CSRF-Token)
- Refresh token хранится в HTTP-only cookie
- Access token обновляется автоматически при 401
- Сессия очищается при выходе
- Защита от XSS - script теги санитизируются
- Пароль не виден в сетевых запросах
- Установлен заголовок Content-Security-Policy
- Заголовок Strict-Transport-Security (HSTS) для HTTPS
- Пользователь может просмотреть активные сессии
- Пользователь может отозвать другие сессии

### `responsive.spec.ts`
Comprehensive тестирование responsive дизайна на 6 breakpoints:
- **Screenshot Regression:** Автоматическое сравнение скриншотов на всех breakpoints (XXS 375x667, XS 480x800, SM 768x1024, MD 1024x768, LG 1280x720, XL 1920x1080)
- **Horizontal Scroll Prevention:** Проверка отсутствия горизонтальной прокрутки на всех breakpoints
- **Touch Events на Mobile:** Tap события на кнопках/ссылках, swipe жесты, проверка touch targets >= 44x44px (WCAG 2.1 AAA)
- **Portrait/Landscape Переключение:** Проверка переключения ориентации на мобильных и планшетах
- **Layout Integrity:** Проверка отсутствия перекрывающихся элементов, размеров шрифтов, container widths
- **Navigation и Header:** Проверка доступности navigation на всех breakpoints
- **Forms:** Валидация размеров input полей и кнопок на разных устройствах
- **Viewport Meta Tag:** Проверка width=device-width, initial-scale=1

## Запуск тестов

### Предварительные требования

1. **Собрать frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Запустить backend сервисы:**
   - MongoDB (по умолчанию: `mongodb://localhost:27017`)
   - Redis (по умолчанию: `redis://localhost:6379`)
   - Rust API сервер

3. **Установить браузеры Playwright (если еще не установлены):**
   ```bash
   npx playwright install
   ```

### Запуск всех E2E тестов

```bash
cd frontend
npm run test:e2e
```

### Запуск конкретного файла тестов

```bash
npm run test:e2e tests/e2e/auth.spec.ts
npm run test:e2e tests/e2e/role-based-access.spec.ts
npm run test:e2e tests/e2e/security.spec.ts
npm run test:e2e tests/e2e/responsive.spec.ts
```

### Запуск тестов для конкретного breakpoint

```bash
npx playwright test tests/e2e/responsive.spec.ts -g "XXS"
npx playwright test tests/e2e/responsive.spec.ts -g "Desktop"
```

### Запуск только screenshot regression тестов

```bash
npx playwright test tests/e2e/responsive.spec.ts -g "Screenshot Regression"
```

### Обновить screenshot baseline изображения

```bash
npx playwright test tests/e2e/responsive.spec.ts --update-snapshots
```

### Запуск тестов в UI режиме (с браузером)

```bash
npm run test:e2e:ui
```

### Запуск тестов в headed режиме (видимый браузер)

```bash
npx playwright test --headed
```

### Отладка конкретного теста

```bash
npx playwright test --debug tests/e2e/auth.spec.ts
```

## Управление тестовыми данными

### Тесты для роли Student

Тесты для роли student работают из коробки, потому что:
- Новые пользователи регистрируются с ролью `student` по умолчанию
- Тесты создают временных пользователей с уникальными email (`test-${timestamp}@example.com`)
- Тесты очищают localStorage и cookies перед каждым запуском

### Тесты для ролей Teacher и Admin

Некоторые тесты для ролей `teacher` и `admin` **пропущены** по умолчанию, потому что требуют:
1. **Предзаполненную тестовую базу данных** с пользователями определенных ролей
2. **Или** тестовый endpoint для создания пользователей с кастомными ролями

#### Вариант 1: Заполнить тестовую базу данных (рекомендуется)

Создайте тестовых пользователей в базе данных перед запуском тестов:

```javascript
// Пример скрипта для заполнения MongoDB
db.users.insertMany([
  {
    email: 'teacher@test.com',
    password_hash: '<bcrypt_hash_для_TeacherPassword123!>',
    name: 'Test Teacher',
    role: 'teacher',
    group_ids: ['test-group-1'],
    is_blocked: false,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    email: 'admin@test.com',
    password_hash: '<bcrypt_hash_для_AdminPassword123!>',
    name: 'Test Admin',
    role: 'admin',
    group_ids: [],
    is_blocked: false,
    created_at: new Date(),
    updated_at: new Date()
  }
]);
```

Затем уберите `.skip` из тестов в `role-based-access.spec.ts`:

```typescript
test('teacher can access teacher dashboard', async ({ page }) => { ... });
// Убрать .skip ^

test('admin can access admin console', async ({ page }) => { ... });
// Убрать .skip ^
```

#### Вариант 2: Тестовый endpoint (не рекомендуется для production)

Добавьте специальный endpoint, доступный только в тестовом окружении:

```rust
#[cfg(test)]
pub async fn create_test_user(role: UserRole) -> Result<User> {
    // Создать пользователя с указанной ролью
}
```

## Интеграция с CI/CD

### GitHub Actions

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: frontend

      - name: Install Playwright browsers
        run: npx playwright install --with-deps
        working-directory: frontend

      - name: Start MongoDB
        uses: supercharge/mongodb-github-action@1.10.0

      - name: Start Redis
        uses: supercharge/redis-github-action@1.7.0

      - name: Build frontend
        run: npm run build
        working-directory: frontend

      - name: Start backend
        run: cargo run &
        working-directory: backend/rust-api

      - name: Run E2E tests
        run: npm run test:e2e
        working-directory: frontend

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

## Конфигурация тестов

Конфигурация находится в `frontend/playwright.config.ts`:

```typescript
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
```

## Отчеты о тестах

После запуска тестов просмотрите HTML отчет:

```bash
npx playwright show-report
```

## Устранение неполадок

### Тесты падают с ошибкой "Timeout waiting for page"

- **Причина:** Backend сервисы не запущены или конфликт портов
- **Решение:**
  ```bash
  # Проверить, запущены ли сервисы
  curl http://localhost:3000/health  # Backend
  curl http://localhost:4173/        # Frontend preview

  # Перезапустить сервисы при необходимости
  ```

### Тесты падают с ошибкой "Element not found"

- **Причина:** Изменились селекторы frontend или элементы не отрендерились
- **Решение:**
  - Обновить селекторы в файлах тестов
  - Добавить `await page.waitForSelector()` перед assertions
  - Запустить в headed режиме для отладки: `npx playwright test --headed`

### CSRF тесты падают

- **Причина:** CSRF middleware настроен некорректно
- **Решение:**
  - Проверить, что backend CSRF middleware применен к маршрутам
  - Проверить, что frontend получает CSRF токен после входа
  - Просмотреть сетевые запросы в DevTools браузера

### Тесты для ролей пропущены

- **Ожидаемо:** Тесты для ролей `teacher` и `admin` пропущены по умолчанию
- **Решение:** Заполнить тестовую базу данных пользователями этих ролей (см. выше)

### Screenshot regression тесты падают

- **Причина:** Изменения в дизайне или антиалиасинг шрифтов
- **Решение:**
  - Проверить diff изображения в `test-results/`
  - Если изменения ожидаемые: `npx playwright test --update-snapshots`
  - Если регрессия: исправить CSS и перезапустить тесты
  - Увеличить threshold: `expect(page).toHaveScreenshot({ threshold: 0.2 })`

### Touch events не работают

- **Причина:** Desktop режим в Playwright
- **Решение:** Используйте `page.touchscreen.tap()` вместо `page.click()`

### Horizontal scroll detected

- **Причина:** Элемент шире viewport на конкретном breakpoint
- **Решение:**
  - Добавить `max-width: 100%` на wide элементы
  - Проверить padding/margin на контейнерах
  - Добавить `overflow-x: hidden` где необходимо

## Лучшие практики

1. **Уникальные тестовые данные:** Использовать timestamps в email адресах, чтобы избежать конфликтов
2. **Чистое состояние:** Очищать localStorage и cookies перед каждым тестом
3. **Доступность:** Включать `checkA11y()` в тесты для соответствия WCAG
4. **Обработка ошибок:** Использовать `try-catch` для ожидаемых ошибок (напр., неудачный вход)
5. **Стратегии ожидания:** Использовать `waitForURL`, `waitForSelector` вместо фиксированных таймаутов
6. **Параллельное выполнение:** Тесты запускаются параллельно по умолчанию - убедитесь, что они не конфликтуют

## Связанная документация

- [Документация Playwright](https://playwright.dev/)
- [TD-06 - Аутентификация и авторизация](../../../tasks/TD-06.md)
- [Требования безопасности](../../../requirements/сценарии/требования.md)
