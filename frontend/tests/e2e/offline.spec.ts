import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from './utils/test-harness';
import {
  completeUserSetup,
  startFirstLesson,
  submitAnswer,
  syncOfflineQueue,
  getSnapshot,
} from './utils/app-actions';

test.describe('Offline queue', () => {
  test('syncs answers after reconnect', async ({ page }) => {
    const harness = await setupTestHarness(page);

    await page.goto('/');
    await completeUserSetup(page);
    await startFirstLesson(page);

    await harness.setNetworkError(true);
    await submitAnswer(page, 'Ответ без сети');
    await page.waitForFunction(
      () =>
        ((window as unknown as { __lessonStore__?: { snapshot: { connection: { queueSize: number } } } })
          .__lessonStore__?.snapshot.connection.queueSize ?? 0) === 1,
    );
    await harness.setNetworkError(false);

    harness.queueAnswerResponse({
      correct: true,
      score_awarded: 10,
      combo_bonus: 0,
      total_score: 150,
      current_streak: 1,
      feedback: 'Синхронизировано',
    });

    await syncOfflineQueue(page);
    const snapshot = await getSnapshot<{ connection: { queueSize: number } }>(page);
    expect(snapshot.connection.queueSize).toBe(0);

    await injectAxe(page);
    await checkA11y(page);
  });
});
