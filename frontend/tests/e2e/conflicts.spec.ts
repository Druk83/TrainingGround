import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from './utils/test-harness';
import {
  completeUserSetup,
  startFirstLesson,
  submitAnswer,
  syncOfflineQueue,
  resolveFirstConflict,
  getSnapshot,
} from './utils/app-actions';

test.describe('Conflict resolver', () => {
  test('guides the user through resolving queued conflicts', async ({ page }) => {
    const harness = await setupTestHarness(page);

    await page.goto('/');
    await completeUserSetup(page);
    await startFirstLesson(page);

    await harness.setNetworkError(true);
    await submitAnswer(page, 'Ответ который создаст конфликт');
    await harness.setNetworkError(false);

    harness.setAnswerMode('conflict');
    await syncOfflineQueue(page);

    await page.waitForFunction(
      () =>
        ((window as unknown as { __lessonStore__?: { snapshot: { conflicts: unknown[] } } })
          .__lessonStore__?.snapshot.conflicts.length ?? 0) === 1,
    );

    await resolveFirstConflict(page, 'accept-server');
    const snapshot = await getSnapshot<{ conflicts: unknown[] }>(page);
    expect(snapshot.conflicts.length).toBe(0);

    await injectAxe(page);
    await checkA11y(page);
  });
});
