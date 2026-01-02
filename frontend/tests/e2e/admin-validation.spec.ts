import { test, expect } from '@playwright/test';

const adminProfile = {
  id: 'admin-validator',
  email: 'admin@test.com',
  name: 'Admin Validator',
  role: 'admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

test.describe('Admin form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('access_token', 'validator-token');
      localStorage.setItem('user', JSON.stringify(user));
    }, adminProfile);
    await page.route('**/admin/users?*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
        return;
      }
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid data' }),
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/admin/groups?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('shows validation errors for invalid email', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();

    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="name"]', 'Invalid Email User');
    await page.selectOption('select[name="role"]', 'student');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();

    const emailMessage = await page
      .locator('input[name="email"]')
      .evaluate((input) => (input as HTMLInputElement).validationMessage);
    expect(emailMessage).not.toEqual('');
  });

  test('prevents short password submission', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();

    await page.fill('input[name="email"]', `short-${Date.now()}@example.com`);
    await page.fill('input[name="password"]', '123');
    await page.fill('input[name="name"]', 'Short Password');
    await page.selectOption('select[name="role"]', 'student');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();

    const passwordValidity = await page
      .locator('input[name="password"]')
      .evaluate((input) => (input as HTMLInputElement).validity.valid);
    expect(passwordValidity).toBe(false);
  });
});
