import { expect, Page } from '@playwright/test';

export async function completeUserSetup(page: Page, userId = 'student-e2e') {
  await dismissOnboarding(page);
  await page.evaluate(([id]) => {
    localStorage.setItem('tg-user', JSON.stringify({ id, groupId: 'demo-group', token: '' }));
  }, [userId]);
}

export async function startFirstLesson(page: Page) {
  const firstLesson = page.locator('lesson-catalog button').first();
  await firstLesson.click();
  await page.evaluate(() =>
    (window as unknown as { __lessonStore__?: { startSession: (id: string) => Promise<void> } })
      .__lessonStore__?.startSession('intro-grammar'),
  );
  await page.waitForFunction(
    () =>
      Boolean(
        (
          (window as unknown as {
            __lessonStore__?: { snapshot: { activeSession?: { id?: string } } };
          }).__lessonStore__ ?? { snapshot: {} as { activeSession?: { id?: string } } }
        ).snapshot.activeSession,
      ),
  );
}

export async function submitAnswer(page: Page, text: string) {
  await page.evaluate(
    ([payload]) =>
      (window as unknown as {
        __lessonStore__?: { submitAnswer: (answer: string) => Promise<void> };
      }).__lessonStore__?.submitAnswer(payload),
    [text],
  );
}

export async function requestHint(page: Page) {
  await page.evaluate(
    () =>
      (window as unknown as { __lessonStore__?: { requestHint: () => Promise<void> } })
        .__lessonStore__?.requestHint(),
  );
}

export async function syncOfflineQueue(page: Page) {
  await page.evaluate(
    () =>
      (window as unknown as { __lessonStore__?: { flushOfflineQueue: () => Promise<void> } })
        .__lessonStore__?.flushOfflineQueue(),
  );
}

export async function resolveFirstConflict(page: Page, resolution: 'accept-server' | 'keep-local' = 'accept-server') {
  await page.evaluate(([choice]) => {
    const store = (window as unknown as {
      __lessonStore__?: { snapshot: { conflicts: Array<{ id: string }> }; resolveConflict: (id: string, resolution: string) => Promise<void> };
    }).__lessonStore__;
    const conflict = store?.snapshot.conflicts[0];
    if (store && conflict) {
      store.resolveConflict(conflict.id, choice);
    }
  }, [resolution]);
}

export async function getSnapshot<T = unknown>(page: Page): Promise<T> {
  return page.evaluate(() => {
    const store = (window as unknown as { __lessonStore__?: { snapshot: unknown } }).__lessonStore__;
    return store?.snapshot ?? {};
  }) as Promise<T>;
}


async function dismissOnboarding(page: Page) {
  const button = page.getByRole('button', { name: 'Понятно' });
  try {
    await button.click({ timeout: 1500 });
  } catch {
    // overlay already hidden or not rendered yet, no-op
  }
}
