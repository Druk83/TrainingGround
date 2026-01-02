import type { Page } from '@playwright/test';

export async function setupMSWInBrowser(page: Page) {
  // Инжектируем MSW setup код в страницу перед загрузкой
  await page.addInitScript(() => {
    // Флаг что MSW должен быть активирован
    (window as any).__USE_MSW__ = true;
  });
}

export async function startMSW(page: Page) {
  // Запускаем MSW worker после загрузки страницы
  await page.evaluate(async () => {
    if (!(window as any).__USE_MSW__) return;

    try {
      // Динамически импортируем MSW
      const { setupWorker } = await import('msw/browser');
      const { http, HttpResponse } = await import('msw');

      const templates: any[] = [];
      let nextId = 1;

      const handlers = [
        http.get('http://localhost:8081/api/v1/auth/me', () => {
          return HttpResponse.json({
            id: 'content-admin-e2e',
            email: 'content-admin@test.com',
            name: 'Content Admin',
            role: 'content_admin',
            group_ids: [],
            created_at: new Date().toISOString(),
          });
        }),

        http.get('http://localhost:8081/api/v1/auth/csrf-token', () => {
          return HttpResponse.json({ token: 'mock-csrf-123' });
        }),

        http.get('http://localhost:8081/admin/system/metrics', () => {
          return HttpResponse.json({
            total_users: 100,
            blocked_users: 5,
            total_groups: 10,
            total_incidents: 20,
            open_incidents: 3,
            critical_incidents: 1,
            active_sessions: 50,
            audit_events_24h: 500,
            uptime_seconds: 86400,
          });
        }),

        http.get('http://localhost:8081/admin/backups', () => HttpResponse.json([])),
        http.get('http://localhost:8081/admin/topics', () => HttpResponse.json([])),
        http.get('http://localhost:8081/admin/levels', () => HttpResponse.json([])),
        http.get('http://localhost:8081/admin/rules', () => HttpResponse.json([])),

        http.get('http://localhost:8081/admin/templates', () => {
          console.log('[MSW] GET /admin/templates ->', templates);
          return HttpResponse.json(templates);
        }),

        http.post('http://localhost:8081/admin/templates', async ({ request }: { request: any }) => {
          const body = await request.json() as any;
          const template = {
            id: `template-${nextId++}`,
            slug: body.slug ?? `template-${nextId}`,
            status: 'draft',
            version: 1,
            difficulty: body.difficulty ?? 'A1',
            level: { id: body.level_id ?? '507f1f77bcf86cd799439011', label: 'Beginner' },
            content: body.content ?? '',
            params: body.params,
            metadata: body.metadata,
            source_refs: body.source_refs,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          templates.push(template);
          console.log('[MSW] POST /admin/templates ->', template);
          return HttpResponse.json(template, { status: 201 });
        }),

        http.post('http://localhost:8081/admin/templates/:id/submit', ({ params }: { params: any }) => {
          const template = templates.find(t => t.id === params.id);
          if (!template) return new HttpResponse(null, { status: 404 });
          template.status = 'pending_review';
          template.updated_at = new Date().toISOString();
          console.log('[MSW] POST /admin/templates/:id/submit ->', template);
          return HttpResponse.json(template);
        }),

        http.post('http://localhost:8081/admin/templates/:id/approve', ({ params }: { params: any }) => {
          const template = templates.find(t => t.id === params.id);
          if (!template) return new HttpResponse(null, { status: 404 });
          if (template.status === 'pending_review') {
            template.status = 'reviewed_once';
          } else if (template.status === 'reviewed_once') {
            template.status = 'ready';
          }
          template.updated_at = new Date().toISOString();
          console.log('[MSW] POST /admin/templates/:id/approve ->', template);
          return HttpResponse.json(template);
        }),

        http.patch('http://localhost:8081/admin/templates/:id', async ({ params, request }: { params: any; request: any }) => {
          const template = templates.find(t => t.id === params.id);
          if (!template) return new HttpResponse(null, { status: 404 });
          const body = await request.json() as any;
          if (body.status) template.status = body.status;
          template.updated_at = new Date().toISOString();
          console.log('[MSW] PATCH /admin/templates/:id ->', template);
          return HttpResponse.json(template);
        }),
      ];

      const worker = setupWorker(...handlers);
      await worker.start({
        onUnhandledRequest: 'bypass',
        quiet: false,
      });

      (window as any).__MSW_WORKER__ = worker;
      (window as any).__MSW_TEMPLATES__ = templates;
      console.log('[MSW] Worker started successfully');
    } catch (error) {
      console.error('[MSW] Failed to start:', error);
    }
  });
}

export async function stopMSW(page: Page) {
  await page.evaluate(() => {
    const worker = (window as any).__MSW_WORKER__;
    if (worker) {
      worker.stop();
      console.log('[MSW] Worker stopped');
    }
  });
}

export async function getTemplatesFromMSW(page: Page): Promise<any[]> {
  return await page.evaluate(() => {
    return (window as any).__MSW_TEMPLATES__ || [];
  });
}
