import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and cookies before each test
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

  test('user can register a new account', async ({ page }) => {
    await page.goto('/register');

    // Wait for registration form to be visible
    await expect(page.locator('h1')).toContainText('Register');

    // Generate unique email for this test
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;
    const testPassword = 'SecurePassword123!';
    const testName = 'Test User';

    // Fill registration form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.fill('input[name="name"]', testName);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to home page after successful registration
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Verify user is logged in (check for logout button or user menu)
    await expect(page.locator('button:has-text("Logout"), a:has-text("Profile")')).toBeVisible({
      timeout: 3000,
    });

    // Verify access token is stored
    const hasAccessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token') !== null;
    });
    expect(hasAccessToken).toBe(true);

    // Verify refresh token is in HTTP-only cookie (we can't read it from JS, but check it was set)
    const cookies = await page.context().cookies();
    const refreshTokenCookie = cookies.find((c) => c.name === 'refresh_token');
    expect(refreshTokenCookie).toBeDefined();
    expect(refreshTokenCookie?.httpOnly).toBe(true);
    expect(refreshTokenCookie?.sameSite).toBe('Strict');

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  test('user can login with existing account', async ({ page }) => {
    // First, register a user (we could also use a pre-seeded test user)
    const testEmail = `test-login-${Date.now()}@example.com`;
    const testPassword = 'SecurePassword123!';

    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.fill('input[name="name"]', 'Login Test User');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Logout
    await page.click('button:has-text("Logout"), a:has-text("Logout")');
    await page.waitForURL('/login', { timeout: 5000 });

    // Now test login
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for redirect after successful login
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Verify user is logged in
    const hasAccessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token') !== null;
    });
    expect(hasAccessToken).toBe(true);

    // Check accessibility
    await injectAxe(page);
    await checkA11y(page);
  });

  test('user cannot login with wrong password', async ({ page }) => {
    // Register a user first
    const testEmail = `test-wrong-pwd-${Date.now()}@example.com`;
    const correctPassword = 'CorrectPassword123!';

    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', correctPassword);
    await page.fill('input[name="confirmPassword"]', correctPassword);
    await page.fill('input[name="name"]', 'Wrong Password Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Logout
    await page.click('button:has-text("Logout"), a:has-text("Logout")');
    await page.waitForURL('/login', { timeout: 5000 });

    // Try to login with wrong password
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(
      page.locator('text=/Invalid (email or )?password/i, [role="alert"]')
    ).toBeVisible({ timeout: 3000 });

    // Should still be on login page
    await expect(page).toHaveURL(/\/login/);

    // Should NOT have access token
    const hasAccessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token') !== null;
    });
    expect(hasAccessToken).toBe(false);
  });

  test('user is redirected to login when accessing protected route without auth', async ({
    page,
  }) => {
    // Try to access a protected route (e.g., /profile)
    await page.goto('/profile');

    // Should be redirected to login
    await page.waitForURL('/login', { timeout: 5000 });

    // Verify login page is displayed
    await expect(page.locator('h1')).toContainText(/Login|Sign In/i);
  });

  test('user can logout successfully', async ({ page }) => {
    // Register and login
    const testEmail = `test-logout-${Date.now()}@example.com`;
    const testPassword = 'SecurePassword123!';

    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.fill('input[name="name"]', 'Logout Test User');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Verify logged in
    let hasAccessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token') !== null;
    });
    expect(hasAccessToken).toBe(true);

    // Logout
    await page.click('button:has-text("Logout"), a:has-text("Logout")');

    // Wait for redirect to login page
    await page.waitForURL('/login', { timeout: 5000 });

    // Verify access token is removed
    hasAccessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token') !== null;
    });
    expect(hasAccessToken).toBe(false);

    // Verify refresh token cookie is cleared
    const cookies = await page.context().cookies();
    const refreshTokenCookie = cookies.find((c) => c.name === 'refresh_token');
    // Cookie should either be absent or have empty value with max-age=0
    expect(refreshTokenCookie === undefined || refreshTokenCookie.value === '').toBe(true);
  });

  test('account is locked after 5 failed login attempts', async ({ page }) => {
    // Register a user first
    const testEmail = `test-rate-limit-${Date.now()}@example.com`;
    const correctPassword = 'CorrectPassword123!';

    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', correctPassword);
    await page.fill('input[name="confirmPassword"]', correctPassword);
    await page.fill('input[name="name"]', 'Rate Limit Test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(http:\/\/localhost:\d+)?\/$/, { timeout: 5000 });

    // Logout
    await page.click('button:has-text("Logout"), a:has-text("Logout")');
    await page.waitForURL('/login', { timeout: 5000 });

    // Attempt 5 failed logins
    for (let i = 0; i < 5; i++) {
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="password"]', `WrongPassword${i}!`);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500); // Small delay between attempts
    }

    // 6th attempt should be blocked with 429 Too Many Requests
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'WrongPassword6!');
    await page.click('button[type="submit"]');

    // Should show "too many attempts" error
    await expect(
      page.locator('text=/too many (failed login )?attempts/i, [role="alert"]')
    ).toBeVisible({ timeout: 3000 });
  });
});
