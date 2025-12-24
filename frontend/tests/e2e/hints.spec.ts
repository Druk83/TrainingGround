import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';
import { setupTestHarness } from './utils/test-harness';
import { completeUserSetup, startFirstLesson, requestHint, getSnapshot } from './utils/app-actions';

test.describe('Hints panel', () => {
  test('helps track hint usage and limits', async ({ page }) => {
    await setupTestHarness(page, {
      hints: [
        {
          hint: 'first',
          hint_text: 'Подсказка 1',
          hints_used: 1,
          hints_remaining: 2,
          cost: 5,
          new_score: 110,
        },
        {
          hint: 'second',
          hint_text: 'Подсказка 2',
          hints_used: 2,
          hints_remaining: 1,
          cost: 5,
          new_score: 105,
        },
        {
          hint: 'last',
          hint_text: 'Финальная подсказка',
          hints_used: 3,
          hints_remaining: 0,
          cost: 5,
          new_score: 100,
        },
      ],
    });

    await page.goto('/');
    await completeUserSetup(page);
    await startFirstLesson(page);

    await requestHint(page);
    await requestHint(page);
    await requestHint(page);

    await page.waitForFunction(
      () =>
        ((window as unknown as { __lessonStore__?: { snapshot: { hints: { items: unknown[] } } } })
          .__lessonStore__?.snapshot.hints.items.length ?? 0) === 3,
    );
    const snapshot = await getSnapshot<{
      hints: { items: Array<{ text: string }>; explanations: unknown[] };
      scoreboard: { hintsUsed: number; hintsRemaining?: number };
    }>(page);
    expect(snapshot.hints.items.map((item) => item.text)).toContain('Финальная подсказка');
    expect(snapshot.scoreboard.hintsUsed).toBe(3);
    expect(snapshot.scoreboard.hintsRemaining).toBe(0);

    await injectAxe(page);
    await checkA11y(page);
  });
});
