import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from './utils/test-harness';
import { completeUserSetup, startFirstLesson, submitAnswer, getSnapshot } from './utils/app-actions';

test.describe('Lesson flow', () => {
  test('user can answer a lesson and see updated stats', async ({ page }) => {
    await setupTestHarness(page);

    await page.goto('/');
    await completeUserSetup(page);
    await startFirstLesson(page);

    await submitAnswer(page, 'Развёрнутый ответ для проверки');
    await page.waitForFunction(
      () =>
        (window as unknown as {
          __lessonStore__?: { snapshot: { notifications: Array<{ text: string }> } };
        }).__lessonStore__?.snapshot.notifications.some((note) => note.text.includes('Ответ верный')),
    );
    const snapshot = await getSnapshot<{ scoreboard: { totalScore: number } }>(page);
    expect(snapshot.scoreboard.totalScore).toBeGreaterThanOrEqual(120);

    await injectAxe(page);
    await checkA11y(page);
  });
});
