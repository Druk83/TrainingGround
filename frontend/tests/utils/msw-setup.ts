import type { Page } from '@playwright/test';

export async function setupMSW(page: Page) {
  await page.addInitScript(() => {
    window.__MSW_ENABLED__ = true;
  });

  await page.goto('/');

  await page.evaluate(async () => {
    const { setupWorker } = await import('msw/browser');
    const { handlers } = await import('../mocks/handlers');

    const worker = setupWorker(...handlers);
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: false,
    });

    (window as any).__MSW_WORKER__ = worker;
  });
}

export async function cleanupMSW(page: Page) {
  await page.evaluate(() => {
    const worker = (window as any).__MSW_WORKER__;
    if (worker) {
      worker.stop();
    }
  });
}

export async function resetMSWHandlers(page: Page) {
  await page.evaluate(async () => {
    const { resetTemplates } = await import('../mocks/handlers');
    resetTemplates();
  });
}

declare global {
  interface Window {
    __MSW_ENABLED__?: boolean;
    __MSW_WORKER__?: any;
  }
}
