import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from './utils/test-harness';
import { completeUserSetup, startFirstLesson, getSnapshot } from './utils/app-actions';

test.describe('Lesson timer', () => {
  test('announces expiration events', async ({ page }) => {
    const harness = await setupTestHarness(page);

    await page.goto('/');
    await completeUserSetup(page);
    await startFirstLesson(page);

    await harness.emitTimer({
      type: 'time-expired',
      session_id: harness.sessionId,
      timestamp: new Date().toISOString(),
      message: 'expired',
    });

    await page.waitForFunction(
      () =>
        ((window as unknown as { __lessonStore__?: { snapshot: { timer: { status: string } } } })
          .__lessonStore__?.snapshot.timer.status ?? '') === 'expired',
    );
    const snapshot = await getSnapshot<{ timer: { remainingSeconds: number } }>(page);
    expect(snapshot.timer.remainingSeconds).toBe(0);

    await injectAxe(page);
    await checkA11y(page);
  });
});
