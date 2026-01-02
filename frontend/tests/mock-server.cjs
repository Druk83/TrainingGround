const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const templates = [];
let nextId = 1;

const contentAdminProfile = {
  id: 'content-admin-e2e',
  email: 'content-admin@test.com',
  name: 'Content Admin',
  role: 'content_admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

// Auth endpoints
app.get('/api/v1/auth/me', (req, res) => {
  res.json(contentAdminProfile);
});

app.get('/api/v1/auth/csrf-token', (req, res) => {
  res.json({ token: 'mock-csrf-123' });
});

// Admin endpoints
app.get('/admin/system/metrics', (req, res) => {
  res.json({
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
});

app.get('/admin/backups', (req, res) => res.json([]));
app.get('/admin/topics', (req, res) => res.json([]));
app.get('/admin/levels', (req, res) => res.json([]));
app.get('/admin/rules', (req, res) => res.json([]));

// Templates endpoints
app.get('/admin/templates', (req, res) => {
  console.log('[Mock] GET /admin/templates ->', templates.length, 'templates');
  res.json(templates);
});

app.post('/admin/templates', (req, res) => {
  const template = {
    id: `template-${nextId++}`,
    slug: req.body.slug || `template-${nextId}`,
    status: 'draft',
    version: 1,
    difficulty: req.body.difficulty || 'A1',
    level: {
      id: req.body.level_id || '507f1f77bcf86cd799439011',
      label: 'Beginner Level',
    },
    content: req.body.content || '',
    params: req.body.params,
    metadata: req.body.metadata,
    source_refs: req.body.source_refs,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  templates.push(template);
  console.log('[Mock] POST /admin/templates ->', template.id);
  res.status(201).json(template);
});

app.post('/admin/templates/:id/submit', (req, res) => {
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Not found' });
  template.status = 'pending_review';
  template.updated_at = new Date().toISOString();
  console.log('[Mock] POST /admin/templates/:id/submit ->', template.id);
  res.json(template);
});

app.post('/admin/templates/:id/approve', (req, res) => {
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Not found' });

  if (template.status === 'pending_review') {
    template.status = 'reviewed_once';
  } else if (template.status === 'reviewed_once') {
    template.status = 'ready';
  }
  template.updated_at = new Date().toISOString();
  console.log('[Mock] POST /admin/templates/:id/approve ->', template.id, template.status);
  res.json(template);
});

app.post('/admin/templates/:id/reject', (req, res) => {
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Not found' });
  template.status = 'draft';
  template.updated_at = new Date().toISOString();
  if (req.body.reason && template.metadata) {
    template.metadata.rejection_reason = req.body.reason;
  }
  console.log('[Mock] POST /admin/templates/:id/reject ->', template.id);
  res.json(template);
});

app.patch('/admin/templates/:id', (req, res) => {
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Not found' });

  if (req.body.status) {
    template.status = req.body.status;
  }
  template.updated_at = new Date().toISOString();
  console.log('[Mock] PATCH /admin/templates/:id ->', template.id, req.body);
  res.json(template);
});

// Reset endpoint for tests
app.post('/test/reset', (req, res) => {
  templates.length = 0;
  nextId = 1;
  console.log('[Mock] Test data reset');
  res.json({ status: 'reset' });
});

const PORT = 8081;
const server = app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down mock server');
  server.close();
});
