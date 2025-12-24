import { test } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from '../e2e/utils/test-harness';
import { completeUserSetup, startFirstLesson, submitAnswer, syncOfflineQueue } from '../e2e/utils/app-actions';

test.describe('WCAG regression', () => {
  test('landing, active session and conflict states remain accessible', async ({ page }) => {
    const harness = await setupTestHarness(page);

    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page, undefined, { detailedReport: true });

    await completeUserSetup(page);
    await startFirstLesson(page);
    await checkA11y(page, undefined, { detailedReport: true });

    await harness.setNetworkError(true);
    await submitAnswer(page, 'Ответ для теста a11y');
    await harness.setNetworkError(false);

    harness.setAnswerMode('conflict');
    await syncOfflineQueue(page);
    await checkA11y(page, undefined, { detailedReport: true });
  });
});
