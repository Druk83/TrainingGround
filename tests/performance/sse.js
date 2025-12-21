import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Test configuration: 10 concurrent SSE connections
export const options = {
  scenarios: {
    sse_connections: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // SSE initial connection
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJyb2xlIjoic3R1ZGVudCIsImdyb3VwX2lkcyI6WyJncm91cDEiXSwiZXhwIjo5OTk5OTk5OTk5fQ.test';

export function setup() {
  // Create test session for each VU
  const sessions = [];
  for (let i = 0; i < 10; i++) {
    const createSessionPayload = JSON.stringify({
      user_id: `sse-test-user-${i}`,
      task_id: 'task-1',
      difficulty: 'medium',
    });

    const createSessionRes = http.post(`${BASE_URL}/api/v1/sessions`, createSessionPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'X-Forwarded-For': `192.168.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`,
      },
    });

    if (createSessionRes.status === 201) {
      const session = JSON.parse(createSessionRes.body);
      sessions.push(session.session_id);
    }
  }

  return { sessions };
}

export default function (data) {
  const sessionId = data.sessions[__VU % data.sessions.length];

  // Open SSE stream
  const params = {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'Accept': 'text/event-stream',
      'X-Forwarded-For': `192.168.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`,
    },
    tags: { name: 'SSE_Stream' },
    timeout: '30s', // Keep connection for 30 seconds
  };

  let res = http.get(`${BASE_URL}/api/v1/sessions/${sessionId}/stream`, params);
  if (res.status === 429) {
    sleep(0.05);
    res = http.get(`${BASE_URL}/api/v1/sessions/${sessionId}/stream`, params);
  }

  const success = check(res, {
    'SSE connection established': (r) => r.status === 200,
    'content-type is event-stream': (r) => r.headers['Content-Type']?.includes('text/event-stream'),
    'received events': (r) => r.body.includes('event:') || r.body.includes('data:'),
  });

  errorRate.add(!success);

  // Wait before reconnecting
  sleep(5);
}

export function teardown(data) {
  // Cleanup sessions
  const params = {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
  };

  data.sessions.forEach(sessionId => {
    http.post(`${BASE_URL}/api/v1/sessions/${sessionId}/complete`, null, params);
  });
}
