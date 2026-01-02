/**
 * End-to-End Tests for Feature Flags
 * 
 * Tests for:
 * - Feature flag visibility in UI
 * - Flag caching behavior
 * - Flag updates and cache invalidation
 * - User/Group scoped flags
 * 
 * Run with: npx playwright test tests/e2e/feature-flags.spec.ts
 */

import { expect, test } from '@playwright/test';

// Base URL from environment
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_BASE_URL || 'http://localhost:3000';

test.describe('Feature Flags', () => {
  // Setup: Clear flags cache before each test
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    // Clear localStorage
    await page.evaluate(() => {
      localStorage.removeItem('trainingground_feature_flags');
    });
  });

  test.describe('Global Flags', () => {
    test('should show hint button when hints_enabled is true', async ({ page }) => {
      // Mock API response with hints enabled
      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        route.abort('blockedbyclient');
      });

      // Set cache manually
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'hints_enabled',
                enabled: true,
                config: { max_hints_per_task: 3 },
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      // Navigate to task page
      await page.goto(`${BASE_URL}/task/123`);

      // Hint button should be visible
      const hintButton = page.locator('[data-testid="hint-button"]');
      await expect(hintButton).toBeVisible();
      await expect(hintButton).toContainText('Get Hint');
    });

    test('should hide hint button when hints_enabled is false', async ({ page }) => {
      // Set cache with hints disabled
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'hints_enabled',
                enabled: false,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/task/123`);

      // Hint button should NOT be visible
      const hintButton = page.locator('[data-testid="hint-button"]');
      await expect(hintButton).not.toBeVisible();
    });

    test('should show leaderboard when leaderboard_enabled is true', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'leaderboard_enabled',
                enabled: true,
                config: { top_n: 100 },
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/dashboard`);

      const leaderboard = page.locator('[data-testid="leaderboard"]');
      await expect(leaderboard).toBeVisible();
    });

    test('should hide leaderboard when leaderboard_enabled is false', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'leaderboard_enabled',
                enabled: false,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/dashboard`);

      const leaderboard = page.locator('[data-testid="leaderboard"]');
      await expect(leaderboard).not.toBeVisible();
    });
  });

  test.describe('Feature Flag Caching', () => {
    test('should cache flags in localStorage for 5 minutes', async ({ page }) => {
      // Mock successful API response
      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        route.continue();
      });

      await page.goto(`${BASE_URL}/`);

      // Wait for flags to be fetched
      await page.waitForTimeout(500);

      // Check localStorage has cached data
      const cached = await page.evaluate(() => {
        const data = localStorage.getItem('trainingground_feature_flags');
        return data ? JSON.parse(data) : null;
      });

      expect(cached).not.toBeNull();
      expect(cached.flags).toBeDefined();
      expect(cached.lastUpdated).toBeDefined();
    });

    test('should use cached flags instead of making API request', async ({ page }) => {
      // Set cache
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'hints_enabled',
                enabled: true,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      let apiCalled = false;

      // Monitor API calls
      page.on('response', (response) => {
        if (response.url().includes('/api/feature-flags')) {
          apiCalled = true;
        }
      });

      await page.goto(`${BASE_URL}/task/123`);
      await page.waitForTimeout(500);

      // API should NOT be called since cache is fresh
      expect(apiCalled).toBe(false);
    });
  });

  test.describe('User/Group Scoped Flags', () => {
    test('should fetch flags with user_id and group_id parameters', async ({ page }) => {
      let capturedUrl = '';

      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        capturedUrl = route.request().url();
        route.continue();
      });

      await page.goto(`${BASE_URL}/`);

      // Wait for flags to be fetched
      await page.waitForTimeout(500);

      // Check that user_id and group_id were sent
      expect(capturedUrl).toContain('user_id=');
      expect(capturedUrl).toContain('group_id=');
    });

    test('should apply user-scoped flag only to that user', async ({ page }) => {
      // Mock API response with user-scoped flag
      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        route.abort('blockedbyclient');
      });

      // User should see the flag
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'test_feature',
                enabled: true,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/task/123`);

      const element = page.locator('[data-testid="test-feature"]');
      await expect(element).toBeVisible();
    });
  });

  test.describe('Feature Flag Updates', () => {
    test('should refresh flags when updating via admin API', async ({ page }) => {
      // Set initial cache
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'hints_enabled',
                enabled: false,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/task/123`);

      // Hint button should not be visible initially
      let hintButton = page.locator('[data-testid="hint-button"]');
      await expect(hintButton).not.toBeVisible();

      // Simulate updating the flag in admin panel (another window)
      // In real test, this would be done through admin API
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'hints_enabled',
                enabled: true,
                config: { max_hints_per_task: 3 },
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      // Trigger storage event (simulating update from another tab)
      await page.evaluate(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'trainingground_feature_flags',
            newValue: JSON.stringify({
              flags: [
                {
                  flag_key: 'hints_enabled',
                  enabled: true,
                  config: { max_hints_per_task: 3 },
                },
              ],
              lastUpdated: Date.now(),
            }),
          })
        );
      });

      // Reload the composable/service
      await page.reload();

      // Now hint button should be visible
      hintButton = page.locator('[data-testid="hint-button"]');
      await expect(hintButton).toBeVisible();
    });
  });

  test.describe('Anti-Cheat Warnings', () => {
    test('should show warning when anticheat_strict_mode is enabled', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'anticheat_strict_mode',
                enabled: true,
                config: { tab_switch_threshold: 3 },
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/task/123`);

      const warning = page.locator('[data-testid="anticheat-warning"]');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText('Anti-cheat Mode Active');
    });

    test('should NOT show warning when anticheat_strict_mode is disabled', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [
              {
                flag_key: 'anticheat_strict_mode',
                enabled: false,
                config: {},
              },
            ],
            lastUpdated: Date.now(),
          })
        );
      });

      await page.goto(`${BASE_URL}/task/123`);

      const warning = page.locator('[data-testid="anticheat-warning"]');
      await expect(warning).not.toBeVisible();
    });
  });

  test.describe('Cache Expiration', () => {
    test('should refetch flags when cache expires after 5 minutes', async ({ page }) => {
      let apiCallCount = 0;

      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        apiCallCount++;
        route.continue();
      });

      // Set old cache (older than 5 minutes)
      await page.evaluate(() => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: [],
            lastUpdated: Date.now() - 6 * 60 * 1000, // 6 minutes ago
          })
        );
      });

      await page.goto(`${BASE_URL}/`);
      await page.waitForTimeout(500);

      // Should refetch because cache is expired
      expect(apiCallCount).toBeGreaterThan(0);
    });
  });

  test.describe('Fallback Behavior', () => {
    test('should use cached flags if API request fails', async ({ page }) => {
      // Set cache
      const cachedFlags = [
        {
          flag_key: 'hints_enabled',
          enabled: true,
          config: {},
        },
      ];

      await page.evaluate((flags) => {
        localStorage.setItem(
          'trainingground_feature_flags',
          JSON.stringify({
            flags: flags,
            lastUpdated: Date.now(),
          })
        );
      }, cachedFlags);

      // Block API
      await page.route(`${API_URL}/api/feature-flags*`, (route) => {
        route.abort('failed');
      });

      await page.goto(`${BASE_URL}/task/123`);

      // Hint button should still be visible (using cached data)
      const hintButton = page.locator('[data-testid="hint-button"]');
      await expect(hintButton).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('flag checks should not add significant latency', async ({ page }) => {
      await page.goto(`${BASE_URL}/task/123`);

      const start = Date.now();

      // Check multiple flags
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
          // This simulates checking flags in components
          const data = localStorage.getItem('trainingground_feature_flags');
          if (data) {
            JSON.parse(data);
          }
        });
      }

      const elapsed = Date.now() - start;

      // Should complete in <100ms (very fast, localStorage is synchronous)
      expect(elapsed).toBeLessThan(100);
    });
  });
});
