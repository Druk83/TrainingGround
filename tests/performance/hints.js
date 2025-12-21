import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Test configuration: 50 rps target
export const options = {
  stages: [
    { duration: '20s', target: 10 },  // Ramp up to 10 VUs
    { duration: '1m', target: 10 },   // Stay at 10 VUs (≈50 rps)
    { duration: '20s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<300'],  // Hints allowed slower than answers
    'http_req_failed': ['rate<0.01'],    // Error rate < 1%
    'errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJyb2xlIjoic3R1ZGVudCIsImdyb3VwX2lkcyI6WyJncm91cDEiXSwiZXhwIjo5OTk5OTk5OTk5fQ.test';

export function setup() {
  // Create test session
  const createSessionPayload = JSON.stringify({
    user_id: `hint-test-user-${Date.now()}`,
    task_id: 'task-1',
  });

  const createSessionRes = http.post(`${BASE_URL}/api/v1/sessions`, createSessionPayload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'X-Forwarded-For': `192.168.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`,
    },
  });

  check(createSessionRes, {
    'session created': (r) => r.status === 201,
  });

  const session = JSON.parse(createSessionRes.body);
  return { sessionId: session.session_id };
}

export default function (data) {
  const sessionId = data.sessionId;

  // Request hint
  const hintPayload = JSON.stringify({
    task_instance_id: 'task-1',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'X-Forwarded-For': `192.168.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`,
    },
    tags: { name: 'RequestHint' },
  };

  let res = http.post(
    `${BASE_URL}/api/v1/sessions/${sessionId}/hints`,
    hintPayload,
    params
  );

  if (res.status === 429) {
    sleep(0.05);
    res = http.post(`${BASE_URL}/api/v1/sessions/${sessionId}/hints`, hintPayload, params);
  }

  const success = check(res, {
    'status is 200 or 400': (r) => r.status === 200 || r.status === 400, // 400 = limit exceeded
    'has hint or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return 'hint' in body || 'error' in body;
      } catch (e) {
        return false;
      }
    },
  });

  errorRate.add(!success);

  // Think time: hints are less frequent
  sleep(0.2);
}

export function teardown(data) {
  const params = {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
  };

  http.post(`${BASE_URL}/api/v1/sessions/${data.sessionId}/complete`, null, params);
}
