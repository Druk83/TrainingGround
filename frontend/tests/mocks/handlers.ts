import { http, HttpResponse } from 'msw';

export interface TemplateRecord {
  id: string;
  slug: string;
  status: string;
  version: number;
  difficulty: string;
  level: { id: string; label: string };
  content: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  source_refs?: string[];
  created_at: string;
  updated_at: string;
}

export const contentAdminProfile = {
  id: 'content-admin-e2e',
  email: 'content-admin@test.com',
  name: 'Content Admin',
  role: 'content_admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

export const templates: TemplateRecord[] = [];
let nextId = 1;

export const handlers = [
  http.get('http://localhost:8081/api/v1/auth/me', () => {
    return HttpResponse.json(contentAdminProfile);
  }),

  http.get('http://localhost:8081/api/v1/auth/csrf-token', () => {
    return HttpResponse.json({ token: 'mock-csrf-token-123' });
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

  http.get('http://localhost:8081/admin/backups', () => {
    return HttpResponse.json([]);
  }),

  http.get('http://localhost:8081/admin/topics', () => {
    return HttpResponse.json([]);
  }),

  http.get('http://localhost:8081/admin/levels', () => {
    return HttpResponse.json([]);
  }),

  http.get('http://localhost:8081/admin/rules', () => {
    return HttpResponse.json([]);
  }),

  http.get('http://localhost:8081/admin/templates', () => {
    return HttpResponse.json(templates);
  }),

  http.post('http://localhost:8081/admin/templates', async ({ request }) => {
    const body = (await request.json()) as {
      slug?: string;
      difficulty?: string;
      level_id?: string;
      content?: string;
      params?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      source_refs?: string[];
      rule_ids?: string[];
    };

    const template: TemplateRecord = {
      id: `template-${nextId++}`,
      slug: body.slug ?? `template-${nextId}`,
      status: 'draft',
      version: 1,
      difficulty: body.difficulty ?? 'A1',
      level: {
        id: body.level_id ?? '507f1f77bcf86cd799439011',
        label: 'Beginner Level',
      },
      content: body.content ?? '',
      params: body.params,
      metadata: body.metadata,
      source_refs: body.source_refs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    templates.push(template);
    return HttpResponse.json(template, { status: 201 });
  }),

  http.post('http://localhost:8081/admin/templates/:id/submit', ({ params }) => {
    const { id } = params;
    const template = templates.find((t) => t.id === id);
    if (!template) {
      return new HttpResponse(null, { status: 404 });
    }
    template.status = 'pending_review';
    template.updated_at = new Date().toISOString();
    return HttpResponse.json(template);
  }),

  http.post('http://localhost:8081/admin/templates/:id/approve', ({ params }) => {
    const { id } = params;
    const template = templates.find((t) => t.id === id);
    if (!template) {
      return new HttpResponse(null, { status: 404 });
    }
    if (template.status === 'pending_review') {
      template.status = 'reviewed_once';
    } else if (template.status === 'reviewed_once') {
      template.status = 'ready';
    }
    template.updated_at = new Date().toISOString();
    return HttpResponse.json(template);
  }),

  http.post('http://localhost:8081/admin/templates/:id/reject', async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { reason?: string };
    const template = templates.find((t) => t.id === id);
    if (!template) {
      return new HttpResponse(null, { status: 404 });
    }
    template.status = 'draft';
    template.updated_at = new Date().toISOString();
    if (body.reason && template.metadata) {
      template.metadata.rejection_reason = body.reason;
    }
    return HttpResponse.json(template);
  }),

  http.patch('http://localhost:8081/admin/templates/:id', async ({ params, request }) => {
    const { id } = params;
    const body = (await request.json()) as { status?: string };
    const template = templates.find((t) => t.id === id);
    if (!template) {
      return new HttpResponse(null, { status: 404 });
    }
    if (body.status) {
      template.status = body.status;
    }
    template.updated_at = new Date().toISOString();
    return HttpResponse.json(template);
  }),
];

export function resetTemplates() {
  templates.length = 0;
  nextId = 1;
}
