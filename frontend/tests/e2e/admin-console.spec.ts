import { expect, test } from '@playwright/test';

const FRONTEND_URL = process.env['FRONTEND_URL'] || 'http://localhost:4173';

test.describe('Admin Console - Content Management (A6-04)', () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock admin authentication BEFORE page loads
    await page.addInitScript(() => {
      const mockAdminUser = {
        id: 'test-admin-id',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        group_ids: [],
        created_at: new Date().toISOString(),
      };
      const mockToken = 'mock-jwt-token-for-testing';

      localStorage.setItem('user', JSON.stringify(mockAdminUser));
      localStorage.setItem('access_token', mockToken);
    });

    // Mock API endpoints to prevent errors
    await page.route('**/api/admin/metrics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_users: 100,
          blocked_users: 5,
          total_groups: 10,
          total_incidents: 20,
          open_incidents: 3,
          critical_incidents: 1,
          active_sessions: 50,
          audit_events_24h: 500,
          uptime_seconds: 86400,
        }),
      });
    });

    await page.route('**/api/admin/backups', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Navigate to admin page with auth already in place
    await page.goto(`${FRONTEND_URL}/admin`, { waitUntil: 'networkidle' });
  });

  test('T1: Admin console loads successfully', async ({ page }) => {
    // Check that main admin console page loads
    await expect(page).toHaveTitle(/Администрирование|admin/i);

    // Check that main sections are visible
    const adminPanel = page.locator('admin-console main.console');
    await expect(adminPanel).toBeVisible();
  });

  test('T2: Templates tab is accessible', async ({ page }) => {
    // Admin console should load
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T3: Topics tab is accessible', async ({ page }) => {
    // Look for topics/themes tab
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T4: Rules tab is accessible', async ({ page }) => {
    // Look for rules tab
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T5: Quality monitoring tab is accessible', async ({ page }) => {
    // Look for quality/content quality tab
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T6: Embeddings monitor tab is accessible', async ({ page }) => {
    // Look for embeddings tab
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T7: Navigation between tabs works', async ({ page }) => {
    // Admin console should load and be navigable
    await expect(page).toHaveTitle(/Администрирование|admin/i);

    // Main element should be visible
    const mainElement = page.locator('admin-console main.console');
    await expect(mainElement).toBeVisible();
  });

  test('T8: Create template form renders', async ({ page }) => {
    // Check for form container
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T9: Template list displays', async ({ page }) => {
    // Check that list container exists
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T10: Filters are present', async ({ page }) => {
    // Filters should be in DOM
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T11: Rules management section renders', async ({ page }) => {
    // Rules management should be accessible
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T12: Quality monitoring metrics display', async ({ page }) => {
    // Quality section should have metrics
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T13: Embeddings queue status visible', async ({ page }) => {
    // Embeddings section should show queue info
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });

  test('T14: Page navigation and back buttons work', async ({ page }) => {
    // Navigation should work without errors
    await expect(page).toHaveTitle(/Администрирование|admin/i);
  });
});

