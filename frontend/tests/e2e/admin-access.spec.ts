import { test, expect } from '@playwright/test';

const studentProfile = {
  id: 'student-access',
  email: 'student@test.com',
  name: 'Student User',
  role: 'student',
  group_ids: [],
  created_at: new Date().toISOString(),
};

test.describe('Admin access control', () => {
  test('student role is redirected away from /admin/users', async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('access_token', 'student-token');
      localStorage.setItem('user', JSON.stringify(user));
    }, studentProfile);

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/forbidden|\/403/);
  });

  test('anonymous user is redirected to login when hitting admin routes', async ({ page }) => {
    await page.goto('/admin/groups');
    await expect(page).toHaveURL(/\/login/);
  });
});
