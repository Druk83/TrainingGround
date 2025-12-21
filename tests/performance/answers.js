import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Test configuration: 500 rps target, SLA p95 <= 200ms
export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp up to 100 VUs
    { duration: '2m', target: 100 },   // Stay at 100 VUs (≈500 rps)
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],  // SLA: 95% of requests < 200ms
    'http_req_failed': ['rate<0.01'],    // Error rate < 1%
    'errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081';

// Mock JWT token - в реальном тесте получать через /auth endpoint
const JWT_TOKEN = __ENV.JWT_TOKEN || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJyb2xlIjoic3R1ZGVudCIsImdyb3VwX2lkcyI6WyJncm91cDEiXSwiZXhwIjo5OTk5OTk5OTk5fQ.test';

export function setup() {
  // Setup: create test session
  const createSessionPayload = JSON.stringify({
    user_id: 'test-user',
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

  // Submit answer
  const answerPayload = JSON.stringify({
    answer: 'correct_answer',
    idempotency_key: `${sessionId}-${__VU}-${__ITER}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'X-Forwarded-For': `192.168.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`,
    },
    tags: { name: 'SubmitAnswer' },
  };

  // Retry on 429 Too Many Requests with small backoff
  let res = http.post(
    `${BASE_URL}/api/v1/sessions/${sessionId}/answers`,
    answerPayload,
    params
  );

  if (res.status === 429) {
    // simple linear backoff
    sleep(0.05);
    res = http.post(`${BASE_URL}/api/v1/sessions/${sessionId}/answers`, answerPayload, params);
  }

  const success = check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has correct field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return 'correct' in body;
      } catch (e) {
        return false;
      }
    },
  });

  errorRate.add(!success);

  // Think time: ~10ms between requests per VU
  sleep(0.01);
}

export function teardown(data) {
  // Cleanup: complete session
  const params = {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
  };

  http.post(`${BASE_URL}/api/v1/sessions/${data.sessionId}/complete`, null, params);
}
