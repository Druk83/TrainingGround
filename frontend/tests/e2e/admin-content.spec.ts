import { Page, Route, test, expect } from '@playwright/test';

const contentAdminProfile = {
  id: 'content-admin-e2e',
  email: 'content-admin@test.com',
  name: 'Content Admin',
  role: 'content_admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

async function seedContentAdmin(page: Page) {
  return page.addInitScript((user) => {
    window.localStorage.setItem('access_token', 'content-admin-token');
    window.localStorage.setItem('user', JSON.stringify(user));
  }, contentAdminProfile);
}

type TemplateRecord = {
  id: string;
  slug: string;
  status: string;
  version: number;
  difficulty: string;
  level: {
    id: string;
    name: string;
    difficulty: string;
    order: number;
    status: string;
    topic_id: string;
  };
  topic: {
    id: string;
    slug: string;
    name: string;
    description: string;
    icon_url?: string | null;
    sort_order: number;
    status: string;
    created_at: string;
    updated_at: string;
  };
  pii_flags: string[];
  source_refs: string[];
  reviewers: string[];
  updated_at: string;
};

test.describe('Content admin template workflow', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => {
    await seedContentAdmin(page);

const templates: TemplateRecord[] = [];
    let nextId = 1;

    const respondList = async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(templates),
      });
    };

    const updateStatus = (id: string, newStatus: string) => {
      const template = templates.find((record) => record.id === id);
      if (!template) return null;
      template.status = newStatus;
      template.updated_at = new Date().toISOString();
      return template;
    };

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(contentAdminProfile),
      });
    });

    await page.route('**/api/admin/metrics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_users: 100,
          blocked_users: 5,
          total_groups: 10,
          total_incidents: 20,
          open_incidents: 3,
          critical_incidents: 1,
          active_sessions: 50,
          audit_events_24h: 500,
          uptime_seconds: 86400,
        }),
      });
    });

    await page.route('**/api/admin/backups', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/admin/templates*', async (route) => {
      const method = route.request().method();
      const url = new URL(route.request().url());
      const pathname = url.pathname;

      if (method === 'GET' && pathname === '/admin/templates') {
        await respondList(route);
        return;
      }

      if (method === 'POST' && pathname === '/admin/templates') {
        const body = route.request().postData();
        const payload = body ? JSON.parse(body) : {};
        const template = {
          id: `template-${nextId++}`,
          slug: payload.slug ?? `template-${nextId}`,
          status: 'draft',
          version: 1,
          difficulty: payload.difficulty ?? 'A1',
          level: {
            id: payload.level_id ?? 'level-id',
            name: 'Integration Level',
            difficulty: payload.difficulty ?? 'A1',
            order: 1,
            status: 'active',
            topic_id: 'topic-id',
          },
          topic: {
            id: 'topic-id',
            slug: 'topic-slug',
            name: 'Integration Topic',
            description: 'E2E topic',
            icon_url: null,
            sort_order: 0,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          pii_flags: payload.metadata?.pii_flags ?? [],
          source_refs: payload.source_refs ?? [],
          reviewers: [],
          updated_at: new Date().toISOString(),
        };
        templates.unshift(template);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(template),
        });
        return;
      }

      const segments = pathname.split('/').filter(Boolean);
      const action = segments[segments.length - 1];
      const templateId =
        action === 'submit' || action === 'approve'
          ? segments[segments.length - 2]
          : action;

      if (method === 'POST' && action === 'submit') {
        const updated = updateStatus(templateId, 'pending_review');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated),
        });
        return;
      }

      if (method === 'POST' && action === 'approve') {
        const template = templates.find((record) => record.id === templateId);
      const nextStatus =
        template?.status === 'pending_review'
          ? 'reviewed_once'
          : template?.status === 'reviewed_once'
          ? 'ready'
          : template?.status ?? 'draft';
        const updated = updateStatus(templateId, nextStatus);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated),
        });
        return;
      }

      if (method === 'PATCH' && segments.length === 3 && segments[1] === 'templates') {
        const body = route.request().postData();
        const payload = body ? JSON.parse(body) : {};
        const field = payload.status ?? payload?.status;
        const updated = field ? updateStatus(templateId, field) : null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated ?? {}),
        });
        return;
      }

      await route.continue();
    });
  });

  test('content admin can create, moderate and publish template', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForSelector('.tab', { timeout: 60000 });

    // Click on "Шаблоны" tab
    await page.locator('button.tab:has-text("Шаблоны")').click();

    // Wait for tab content to render
    await page.waitForTimeout(1000);

    // Wait for "Создать шаблон" button to appear
    await page.waitForSelector('button:has-text("Создать шаблон")', { timeout: 15000 });
    await page.getByRole('button', { name: 'Создать шаблон' }).click();
    await page.locator('input[name="slug"]').fill('e2e-template');
    await page.locator('input[name="levelId"]').fill('507f1f77bcf86cd799439011');
    await page.locator('select').nth(0).selectOption('A1');
    await page.locator('select').nth(1).selectOption('text_input');
    await page.locator('textarea').first().fill('What is the answer to life?');
    await page.getByLabel('Правильный ответ').fill('42');
    await page.locator('textarea').nth(1).fill('rule-1');
    await page.getByRole('button', { name: 'Создать шаблон' }).click();

    await expect(page.getByText('draft')).toBeVisible();
    await page.getByRole('button', { name: 'На модерацию' }).click();
    await expect(page.getByText('pending_review')).toBeVisible();

    await page.getByRole('button', { name: 'Одобрить' }).click();
    await expect(page.getByText('reviewed_once')).toBeVisible();

    await page.getByRole('button', { name: 'Одобрить' }).click();
    await expect(page.getByText('ready')).toBeVisible();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('published')).toBeVisible();
  });
});
