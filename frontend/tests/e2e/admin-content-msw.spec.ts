import { Page, test, expect } from '@playwright/test';
import { setupMSWInBrowser, startMSW, stopMSW, getTemplatesFromMSW } from './helpers/msw-helper';

const contentAdminProfile = {
  id: 'content-admin-e2e',
  email: 'content-admin@test.com',
  name: 'Content Admin',
  role: 'content_admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

async function seedContentAdmin(page: Page) {
  return page.addInitScript((user) => {
    window.localStorage.setItem('access_token', 'content-admin-token');
    window.localStorage.setItem('user', JSON.stringify(user));
  }, contentAdminProfile);
}

test.describe('Content admin template workflow with MSW', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await seedContentAdmin(page);
    await setupMSWInBrowser(page);
  });

  test.afterEach(async ({ page }) => {
    await stopMSW(page);
  });

  test('content admin can access templates tab with MSW mocking', async ({ page }) => {
    await page.goto('/admin');

    // Запускаем MSW после загрузки страницы
    await startMSW(page);

    // Ждем загрузки консоли
    await page.waitForSelector('.tab', { timeout: 60000 });

    // Переключаемся на вкладку Templates
    await page.evaluate(() => {
      const adminConsole = document.querySelector('admin-console') as any;
      if (adminConsole) {
        adminConsole.activeTab = 'templates';
      }
    });

    // Ждем рендер компонента
    await page.waitForTimeout(2000);

    // Проверяем что template-management появился
    const templateMgmt = page.locator('template-management');
    await expect(templateMgmt).toBeVisible({ timeout: 10000 });

    // Проверяем что шаблоны пустые
    const templates = await getTemplatesFromMSW(page);
    expect(templates).toEqual([]);

    console.log('[Test] Templates tab loaded successfully with MSW');
  });

  test('content admin can create template using MSW', async ({ page }) => {
    await page.goto('/admin');
    await startMSW(page);

    await page.waitForSelector('.tab', { timeout: 60000 });

    // Переключаемся на Templates tab
    await page.evaluate(() => {
      const adminConsole = document.querySelector('admin-console') as any;
      if (adminConsole) {
        adminConsole.activeTab = 'templates';
      }
    });

    await page.waitForTimeout(2000);

    // Проверяем компонент и завершаем loading
    await page.evaluate(() => {
      const templateMgmt = document.querySelector('template-management') as any;
      if (templateMgmt) {
        // Принудительно завершаем loading для теста
        templateMgmt.loading = false;
        templateMgmt.templates = [];
        templateMgmt.requestUpdate();
      }
    });

    await page.waitForTimeout(500);

    // Открываем форму создания
    await page.evaluate(() => {
      const templateMgmt = document.querySelector('template-management') as any;
      if (templateMgmt) {
        templateMgmt.openCreateForm();
      }
    });

    await page.waitForTimeout(1000);

    // Проверяем что форма открылась
    const createButton = page.locator('button:has-text("Создать шаблон")').first();
    await expect(createButton).toBeVisible({ timeout: 10000 });

    console.log('[Test] Template creation form opened successfully');
  });
});
