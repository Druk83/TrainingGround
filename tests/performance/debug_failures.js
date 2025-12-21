import { sleep } from 'k6';
import http from 'k6/http';

export const options = {
  vus: 10,
  duration: '30s',
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'test-token';

export default function () {
  // create session per VU
  const resCreate = http.post(`${BASE_URL}/api/v1/sessions`, JSON.stringify({ user_id: `dbg-${__VU}`, task_id: 'task-1' }), {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JWT_TOKEN}` }
  });

  if (resCreate.status !== 201) {
    console.log(`create failed: status=${resCreate.status} body=${resCreate.body}`);
    return;
  }

  const session = JSON.parse(resCreate.body);

  for (let i = 0; i < 20; i++) {
    const res = http.post(`${BASE_URL}/api/v1/sessions/${session.session_id}/answers`, JSON.stringify({ answer: 'correct_answer', idempotency_key: `${session.session_id}-${i}` }), {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    if (res.status !== 200 && res.status !== 201) {
      console.log(`FAILED: status=${res.status} body=${res.body}`);
    }

    sleep(0.01);
  }
}
