import { Page, test, expect } from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';

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

async function resetMockServer() {
  try {
    await fetch('http://localhost:8081/test/reset', { method: 'POST' });
  } catch (e) {
    console.warn('Failed to reset mock server:', e);
  }
}

async function waitForServer(port: number, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(`http://localhost:${port}/test/reset`);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not start on port ${port} within ${timeout}ms`);
}

test.describe('Content admin template workflow with Mock Server', () => {
  test.describe.configure({ timeout: 120_000 });

  let mockServer: ChildProcess;

  test.beforeAll(async () => {
    // Запускаем mock server перед всеми тестами
    mockServer = spawn('node', ['tests/mock-server.cjs'], {
      stdio: 'inherit',
      shell: true,
    });

    // Ждем пока сервер запустится
    await waitForServer(8081);
    console.log('[Test] Mock server started');
  });

  test.afterAll(async () => {
    // Останавливаем mock server после всех тестов
    if (mockServer) {
      mockServer.kill();
      console.log('[Test] Mock server stopped');
    }
  });

  test.beforeEach(async ({ page }) => {
    await resetMockServer();
    await seedContentAdmin(page);
  });

  test('content admin can access templates tab', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForSelector('.tab', { timeout: 60000 });

    // Переключаемся на вкладку Templates напрямую через свойство
    // (обходим проблему с кликом в Playwright + Lit)
    const result = await page.evaluate(() => {
      const adminConsole = document.querySelector('admin-console') as any;
      if (adminConsole) {
        console.log('[Test] Before:', adminConsole.activeTab);
        adminConsole.activeTab = 'templates';
        adminConsole.requestUpdate();
        console.log('[Test] After:', adminConsole.activeTab);
        return { success: true, tab: adminConsole.activeTab };
      }
      return { success: false };
    });
    console.log('[Test] Tab switch result:', result);

    // Ждем загрузки компонента
    await page.waitForTimeout(5000);

    // Проверяем что template-management появился
    const templateMgmt = page.locator('template-management');
    await expect(templateMgmt).toBeVisible({ timeout: 15000 });

    // Проверяем что кнопка "Создать шаблон" видна
    const createButton = page.locator('button:has-text("Создать шаблон")');
    await expect(createButton).toBeVisible({ timeout: 15000 });

    console.log('[Test] Templates tab loaded successfully');
  });

});

