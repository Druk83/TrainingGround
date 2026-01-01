import { expect, test, type Page } from '@playwright/test';

/**
 * E2E тесты для Teacher Dashboard (A6-03)
 * 
 * Перед запуском убедитесь, что:
 * 1. Backend работает (http://localhost:8081)
 * 2. Frontend разработчик сервер работает (http://localhost:5173)
 * 3. Тестовый пользователь с ролью 'teacher' существует
 */

const BACKEND_URL = process.env['BACKEND_URL'] || 'http://localhost:8081';
const FRONTEND_URL = process.env['FRONTEND_URL'] || 'http://localhost:5173';

test.describe('Teacher Dashboard (A6-03)', () => {
  let page: Page;
  let teacherToken: string;

  test.beforeAll(async ({ browser }) => {
    // Получить токен для тестового учителя
    const context = await browser.newContext();
    page = await context.newPage();

    // Логин тестового учителя
    await page.goto(`${FRONTEND_URL}/login`);
    await page.fill('input[name="email"]', 'teacher@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Ждём редиректа на дашборд
    await page.waitForURL(/\/teacher/);

    // Извлечь токен из localStorage
    teacherToken = (await page.evaluate(() => localStorage.getItem('access_token'))) || '';

    await context.close();
  });

  test('T1: Загрузка дашборда и выбор группы', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на дашборд
    await page.goto(`${FRONTEND_URL}/teacher-dashboard`);

    // Проверить, что загружена шапка и метрики
    await expect(page.locator('h1')).toContainText(/Группа|Teacher Dashboard/i);

    // Проверить наличие dropdown для выбора группы
    const groupSelect = page.locator('select').first();
    await expect(groupSelect).toBeVisible();

    // Выбрать группу
    await groupSelect.selectOption({ index: 0 });

    // Ждём загрузки данных (карточки должны появиться)
    await expect(page.locator('text=Средняя точность')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Средний балл')).toBeVisible();

    await context.close();
  });

  test('T2: Просмотр таблицы учеников с поиском', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на дашборд
    await page.goto(`${FRONTEND_URL}/teacher-dashboard`);

    // Нажать кнопку "Ученики"
    await page.click('a:has-text("Ученики")');

    // Ожидание загрузки страницы учеников
    await page.waitForURL(/\/teacher\/students/);

    // Проверить, что таблица видна
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });

    // Проверить наличие колонок
    await expect(page.locator('th')).toContainText(/ФИО|Email|Последний вход/);

    // Использовать поиск
    const searchInput = page.locator('input[type="search"]').first();
    await searchInput.fill('Иван');

    // Ожидание фильтрации
    await page.waitForTimeout(500);

    // Проверить, что результаты обновились
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    await context.close();
  });

  test('T3: Открытие детальной карточки ученика', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на страницу учеников
    await page.goto(`${FRONTEND_URL}/teacher/students`);

    // Ждём загрузки таблицы
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });

    // Нажать на первую строку (ученика)
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();

    // Ожидание открытия карточки
    await page.waitForURL(/\/teacher\/students\/[a-f0-9]/);

    // Проверить, что карточка содержит информацию об ученике
    await expect(page.locator('text=Email')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Точность')).toBeVisible();
    await expect(page.locator('text=Попыток')).toBeVisible();

    // Проверить наличие таблицы по темам
    await expect(page.locator('text=Прогресс по темам')).toBeVisible();

    await context.close();
  });

  test('T4: Просмотр аналитики по темам', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на дашборд
    await page.goto(`${FRONTEND_URL}/teacher-dashboard`);

    // Нажать кнопку "Аналитика"
    await page.click('a:has-text("Аналитика")');

    // Ожидание загрузки страницы аналитики
    await page.waitForURL(/\/teacher\/analytics/);

    // Проверить, что таблица с темами загружена
    await expect(page.locator('h1')).toContainText(/Аналитика по темам/i);

    // Проверить наличие таблицы
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });

    // Проверить наличие колонок
    await expect(page.locator('th')).toContainText(/Тема|Попыток|Баллы|Точность/);

    // Нажать на заголовок колонки для сортировки
    const accuracyHeader = page.locator('th:has-text("Точность")');
    await accuracyHeader.click();

    // Проверить, что сортировка применилась (должен появиться индикатор)
    await expect(accuracyHeader).toContainText(/↑|↓/);

    await context.close();
  });

  test('T5: Генерация отчёта', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на страницу отчётов
    await page.goto(`${FRONTEND_URL}/teacher/reports`);

    // Проверить, что форма генерации видна
    await expect(page.locator('h2')).toContainText(/Новый отчёт/);

    // Выбрать формат PDF
    await page.selectOption('select[name="format"]', 'pdf');

    // Выбрать период "месяц"
    await page.selectOption('select[name="period"]', 'month');

    // Нажать "Сгенерировать отчёт"
    await page.click('button:has-text("Сгенерировать")');

    // Проверить, что началась генерация (появится сообщение о статусе)
    await expect(page.locator('text=/Отчёт создаётся|генерируется/i')).toBeVisible({
      timeout: 5000,
    });

    // Ождать, пока отчёт будет готов (максимум 30 сек для тестовой группы)
    await expect(page.locator('text=/готов|скачать/i')).toBeVisible({
      timeout: 30000,
    });

    await context.close();
  });

  test('T6: Отправка уведомления', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: FRONTEND_URL,
            localStorage: [
              {
                name: 'access_token',
                value: teacherToken,
              },
            ],
          },
        ],
      },
    });

    const page = await context.newPage();

    // Перейти на страницу уведомлений
    await page.goto(`${FRONTEND_URL}/teacher/notifications`);

    // Проверить, что форма видна
    await expect(page.locator('h1')).toContainText(/Уведомления/i);

    // Выбрать группу
    const groupSelect = page.locator('select').first();
    await groupSelect.selectOption({ index: 0 });

    // Выбрать или создать шаблон
    const templateSelect = page.locator('select').nth(1);
    const options = await templateSelect.locator('option').count();

    if (options > 0) {
      // Если есть шаблоны, выбрать первый
      await templateSelect.selectOption({ index: 0 });
    } else {
      // Создать новый шаблон
      await page.fill('input[name="template-name"]', 'Тестовое уведомление');
      await page.fill('input[name="template-subject"]', 'Привет, {student_name}!');
      await page.fill('textarea[name="template-body"]', 'Это тестовое письмо для группы {group_name}');
      await page.click('button:has-text("Создать")');

      // Ождать создания
      await page.waitForTimeout(1000);
    }

    // Нажать отправить
    const sendButton = page.locator('button:has-text(/Отправить|Send/)').last();
    await sendButton.click();

    // Проверить успешную отправку
    await expect(page.locator('text=/отправлено|успешно/i')).toBeVisible({ timeout: 10000 });

    // Проверить, что запись появилась в истории
    await expect(page.locator('table:has-text("История")')).toBeVisible();

    await context.close();
  });

  test('T7: Проверка доступа (должна быть защита от неавторизованного доступа)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Попытка доступа без токена
    await page.goto(`${FRONTEND_URL}/teacher-dashboard`);

    // Должно произойти перенаправление на логин
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });
});
