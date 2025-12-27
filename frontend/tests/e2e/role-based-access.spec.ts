import { test, expect, Page } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

/**
 * Helper function to register and login a user with specific role
 * Note: By default, users are registered as 'student' role.
 * For testing teacher/admin roles, you would need to either:
 * 1. Use a seeded test database with pre-created users
 * 2. Have an admin endpoint to promote users (not recommended for production)
 * 3. Manually create test users in the database before running tests
 */
async function loginAsRole(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 5000 }); // Wait for redirect away from login
}

async function registerStudent(page: Page): Promise<{ email: string; password: string }> {
  const email = `student-${Date.now()}@example.com`;
  const password = 'StudentPassword123!';

  await page.goto('/register');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.fill('input[name="name"]', 'Test Student');
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

  return { email, password };
}

test.describe('Role-Based Access Control', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    });
  });

  test('student can access student home page', async ({ page }) => {
    // Register as student (default role)
    const { email, password } = await registerStudent(page);

    // Logout and login again to test fresh session
    await page.click('button:has-text("Logout"), a:has-text("Logout")');
    await loginAsRole(page, email, password);

    // Should redirect to student home (/)
    await expect(page).toHaveURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 3000 });

    // Verify student home page content is visible
    // Adjust selectors based on your actual student home page
    await expect(
      page.locator('h1, h2').filter({ hasText: /Courses|Topics|My Progress/i })
    ).toBeVisible({ timeout: 3000 });

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  test('student cannot access admin console', async ({ page }) => {
    // Register as student
    await registerStudent(page);

    // Try to access admin console
    await page.goto('/admin');

    // Should be redirected to forbidden page (403)
    await page.waitForURL(/\/forbidden/, { timeout: 5000 });

    // Verify forbidden page content
    await expect(page.locator('h1')).toContainText(/403|Forbidden|Access Denied/i);

    // Check accessibility of forbidden page
    await injectAxe(page);
    await checkA11y(page);
  });

  test('student cannot access teacher dashboard', async ({ page }) => {
    // Register as student
    await registerStudent(page);

    // Try to access teacher dashboard
    await page.goto('/teacher-dashboard');

    // Should be redirected to forbidden page
    await page.waitForURL(/\/forbidden/, { timeout: 5000 });

    // Verify forbidden page
    await expect(page.locator('h1')).toContainText(/403|Forbidden|Access Denied/i);
  });

  test('student can access their profile page', async ({ page }) => {
    // Register as student
    const { email } = await registerStudent(page);

    // Navigate to profile
    await page.goto('/profile');

    // Should be able to access profile
    await expect(page).toHaveURL(/\/profile/);

    // Verify profile content
    await expect(page.locator('h1, h2')).toContainText(/Profile|Account/i);

    // User's email should be displayed
    await expect(page.locator(`text=${email}`)).toBeVisible();

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  /**
   * Note: The following tests for teacher and admin roles require
   * either pre-seeded test users or a way to create users with
   * specific roles. In a real test environment, you would:
   *
   * 1. Set up a test database with pre-created users of each role
   * 2. Use those credentials in these tests
   * 3. Or, have a special test-only endpoint to create users with roles
   *
   * For now, these are documented as examples but marked as skip
   */

  test.skip('teacher can access teacher dashboard', async ({ page }) => {
    // This would require a pre-created teacher account
    const teacherEmail = 'teacher@test.com';
    const teacherPassword = 'TeacherPassword123!';

    await loginAsRole(page, teacherEmail, teacherPassword);

    // Navigate to teacher dashboard
    await page.goto('/teacher-dashboard');

    // Should be able to access
    await expect(page).toHaveURL(/\/teacher-dashboard/);

    // Verify teacher dashboard content
    await expect(page.locator('h1, h2')).toContainText(/Dashboard|Groups|Students/i);

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  test.skip('teacher cannot access admin console', async ({ page }) => {
    const teacherEmail = 'teacher@test.com';
    const teacherPassword = 'TeacherPassword123!';

    await loginAsRole(page, teacherEmail, teacherPassword);

    // Try to access admin console
    await page.goto('/admin');

    // Should be redirected to forbidden page
    await page.waitForURL(/\/forbidden/, { timeout: 5000 });

    await expect(page.locator('h1')).toContainText(/403|Forbidden|Access Denied/i);
  });

  test.skip('admin can access admin console', async ({ page }) => {
    // This requires a pre-created admin account
    const adminEmail = 'admin@test.com';
    const adminPassword = 'AdminPassword123!';

    await loginAsRole(page, adminEmail, adminPassword);

    // Navigate to admin console
    await page.goto('/admin');

    // Should be able to access
    await expect(page).toHaveURL(/\/admin/);

    // Verify admin console content
    await expect(page.locator('h1, h2')).toContainText(/Admin|Console|Templates/i);

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  test.skip('admin can access all protected routes', async ({ page }) => {
    const adminEmail = 'admin@test.com';
    const adminPassword = 'AdminPassword123!';

    await loginAsRole(page, adminEmail, adminPassword);

    // Test admin console
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1, h2')).toBeVisible();

    // Test teacher dashboard (admin should have access)
    await page.goto('/teacher-dashboard');
    await expect(page).toHaveURL(/\/teacher-dashboard/);
    await expect(page.locator('h1, h2')).toBeVisible();

    // Test profile
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.locator('h1, h2')).toBeVisible();

    // Test student home
    await page.goto('/');
    await expect(page).toHaveURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 3000 });
    await expect(page.locator('h1, h2')).toBeVisible();
  });
});

test.describe('Navigation based on role', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    });
  });

  test('student sees appropriate navigation menu', async ({ page }) => {
    await registerStudent(page);

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Check navigation menu
    // Student should NOT see admin or teacher links
    const adminLink = page.locator('a[href="/admin"], button:has-text("Admin")');
    const teacherLink = page.locator('a[href="/teacher-dashboard"], button:has-text("Teacher")');

    await expect(adminLink).not.toBeVisible();
    await expect(teacherLink).not.toBeVisible();

    // Student SHOULD see profile and logout
    await expect(page.locator('a[href="/profile"], button:has-text("Profile")')).toBeVisible();
    await expect(page.locator('button:has-text("Logout"), a:has-text("Logout")')).toBeVisible();
  });

  test.skip('admin sees all navigation options', async ({ page }) => {
    const adminEmail = 'admin@test.com';
    const adminPassword = 'AdminPassword123!';

    await loginAsRole(page, adminEmail, adminPassword);

    await page.waitForTimeout(1000);

    // Admin should see admin console link
    await expect(
      page.locator('a[href="/admin"], button:has-text("Admin")')
    ).toBeVisible();

    // Admin should also see profile and logout
    await expect(page.locator('a[href="/profile"], button:has-text("Profile")')).toBeVisible();
    await expect(page.locator('button:has-text("Logout"), a:has-text("Logout")')).toBeVisible();
  });
});
