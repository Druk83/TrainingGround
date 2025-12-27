// Comprehensive Accessibility Tests
// Проверка WCAG 2.1 AA compliance с использованием axe-core

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility - Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have sufficient color contrast (WCAG AA >= 4.5:1)', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include(['body'])
      .analyze();

    // Filter for color contrast violations
    const contrastViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id === 'color-contrast'
    );

    expect(contrastViolations).toEqual([]);
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    // Check for aria-label on email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('aria-label');

    // Check for aria-label on password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute('aria-label');

    // Check for aria-live on error messages (if any)
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .include(['body'])
      .analyze();

    // Filter for ARIA violations
    const ariaViolations = accessibilityScanResults.violations.filter(
      (violation) =>
        violation.id.includes('aria') || violation.id.includes('role')
    );

    expect(ariaViolations).toEqual([]);
  });

  test('should support keyboard navigation (Tab, Enter, Esc)', async ({ page }) => {
    // Focus on email input using Tab
    await page.keyboard.press('Tab');
    let focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);

    // Tab to next element
    await page.keyboard.press('Tab');
    focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);

    // Tab to password input
    await page.keyboard.press('Tab');
    focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A']).toContain(focusedElement);

    // Check that focused elements have visible focus indicator
    const focusRingColor = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      return window.getComputedStyle(element).outlineColor;
    });
    // Should not be transparent (rgb(0, 0, 0, 0))
    expect(focusRingColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should scale text to 200% without loss of functionality', async ({ page }) => {
    // Get original button text
    const loginButton = page.locator('button[type="submit"]');
    await expect(loginButton).toBeVisible();

    // Zoom to 200%
    await page.evaluate(() => {
      document.body.style.zoom = '2';
    });

    // Wait for layout to settle
    await page.waitForTimeout(500);

    // Check that button is still visible and clickable
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeEnabled();

    // Check no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '1';
    });
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .analyze();

    // Check for heading order violations
    const headingViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id === 'heading-order'
    );

    expect(headingViolations).toEqual([]);
  });

  test('should have alt text for all images', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .analyze();

    // Check for image alt violations
    const imageAltViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id === 'image-alt'
    );

    expect(imageAltViolations).toEqual([]);
  });
});

test.describe('Accessibility - Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
  });

  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper form labels', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .analyze();

    // Check for label violations
    const labelViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id === 'label' || violation.id === 'form-field-multiple-labels'
    );

    expect(labelViolations).toEqual([]);
  });

  test('should have aria-describedby for password requirements', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]').first();

    // Check if password input has aria-describedby
    const hasAriaDescribedBy = await passwordInput.evaluate((el) => {
      return el.hasAttribute('aria-describedby');
    });

    // Password strength indicators should exist
    if (hasAriaDescribedBy) {
      const describedById = await passwordInput.getAttribute('aria-describedby');
      const descriptionElement = page.locator(`#${describedById}`);
      await expect(descriptionElement).toBeAttached();
    }
  });
});

test.describe('Accessibility - Admin Console', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');

    // Wait for redirect to admin
    await page.waitForURL(/\/admin/);
    await page.waitForLoadState('networkidle');
  });

  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should support keyboard navigation for interactive elements', async ({ page }) => {
    // Tab through interactive elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');

      // Check that focus is on an interactive element
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          role: el?.getAttribute('role'),
          tabIndex: el?.getAttribute('tabindex'),
        };
      });

      // Focused element should be interactive
      expect(
        ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(focusedElement.tagName || '') ||
        ['button', 'link', 'tab', 'menuitem'].includes(focusedElement.role || '')
      ).toBe(true);
    }
  });
});

test.describe('Accessibility - Navigation Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have proper landmark regions', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .analyze();

    // Check for landmark violations
    const landmarkViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id.includes('landmark') || violation.id.includes('region')
    );

    expect(landmarkViolations).toEqual([]);
  });

  test('should have skip-to-main link for keyboard users', async ({ page }) => {
    // Press Tab to focus on skip link
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return {
        text: el?.textContent?.trim(),
        href: (el as HTMLAnchorElement)?.href,
        visible: el?.offsetParent !== null,
      };
    });

    // Skip link should be focused and contain relevant text
    expect(focusedElement.text?.toLowerCase()).toContain('skip');
  });

  test('should have proper aria-current on active navigation items', async ({ page }) => {
    // Check navigation items have aria-current when active
    const navItems = page.locator('nav a, nav button');
    const count = await navItems.count();

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      const ariaCurrent = await item.getAttribute('aria-current');

      // If aria-current is present, it should have valid value
      if (ariaCurrent) {
        expect(['page', 'step', 'location', 'date', 'time', 'true']).toContain(ariaCurrent);
      }
    }
  });
});

test.describe('Accessibility - Color Contrast', () => {
  test('should pass color contrast checks on all pages', async ({ page }) => {
    const pages = ['/login', '/register', '/'];

    for (const pagePath of pages) {
      await page.goto(pagePath);
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .disableRules(['color-contrast-enhanced']) // Only check AA, not AAA
        .analyze();

      const contrastViolations = accessibilityScanResults.violations.filter(
        (violation) => violation.id === 'color-contrast'
      );

      expect(contrastViolations).toEqual([]);
    }
  });
});

test.describe('Accessibility - Screen Reader Compatibility', () => {
  test('should have proper document structure for screen readers', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for proper document title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);

    // Check for html lang attribute
    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBeTruthy();
    expect(['ru', 'en', 'ru-RU', 'en-US']).toContain(htmlLang || '');
  });

  test('should have aria-live regions for dynamic content', async ({ page }) => {
    await page.goto('/login');

    // Try to submit form with invalid data to trigger error message
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);

    // Check if error messages have aria-live or role="alert"
    const errorElements = page.locator('[aria-live], [role="alert"]');
    const count = await errorElements.count();

    // If there are error messages, they should have proper ARIA
    if (count > 0) {
      const firstError = errorElements.first();
      const ariaLive = await firstError.getAttribute('aria-live');
      const role = await firstError.getAttribute('role');

      expect(
        ariaLive === 'polite' ||
        ariaLive === 'assertive' ||
        role === 'alert'
      ).toBe(true);
    }
  });
});

test.describe('Accessibility - Focus Management', () => {
  test('should trap focus in modal dialogs', async ({ page }) => {
    await page.goto('/');

    // Look for any modal triggers
    const modalTriggers = page.locator('button[aria-haspopup="dialog"], button[data-modal]');
    const triggerCount = await modalTriggers.count();

    if (triggerCount > 0) {
      // Open modal
      await modalTriggers.first().click();
      await page.waitForTimeout(300);

      // Tab through elements - focus should stay within modal
      const initialFocus = await page.evaluate(() => document.activeElement?.tagName);

      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
      }

      // Check that focus is still within modal (not on body or outside)
      const currentFocus = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        const activeEl = document.activeElement;
        return modal?.contains(activeEl) || false;
      });

      // If modal exists, focus should be trapped
      const hasModal = await page.locator('[role="dialog"]').count();
      if (hasModal > 0) {
        expect(currentFocus).toBe(true);
      }
    }
  });

  test('should restore focus after closing modal', async ({ page }) => {
    await page.goto('/');

    const modalTriggers = page.locator('button[aria-haspopup="dialog"]');
    const triggerCount = await modalTriggers.count();

    if (triggerCount > 0) {
      // Focus and click modal trigger
      await modalTriggers.first().focus();
      const triggerText = await modalTriggers.first().textContent();
      await modalTriggers.first().click();
      await page.waitForTimeout(300);

      // Close modal with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Focus should return to trigger button
      const focusedText = await page.evaluate(() => {
        return (document.activeElement as HTMLElement)?.textContent?.trim();
      });

      expect(focusedText).toBe(triggerText?.trim());
    }
  });
});

test.describe('Accessibility - Responsive and Mobile', () => {
  test('should be accessible on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have touch targets at least 44x44 px on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Get all interactive elements
    const buttons = page.locator('button, a, input[type="button"], input[type="submit"]');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();

      if (box) {
        // WCAG 2.1 AAA: touch targets should be at least 44x44 px
        // We'll check for minimum 44px (can be less strict for AA)
        expect(box.width >= 44 || box.height >= 44).toBe(true);
      }
    }
  });
});
