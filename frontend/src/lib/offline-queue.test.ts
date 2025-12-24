import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { OfflineQueue } from './offline-queue';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    const dbName = `lesson-offline-${Math.random().toString(36).slice(2)}`;
    queue = new OfflineQueue(dbName);
  });

  it('stores operations and reports size', async () => {
    expect(await queue.size()).toBe(0);
    await queue.enqueue('answer', 'session-1', { answer: '42' });
    await queue.enqueue('hint', 'session-1', { topic_id: 'intro' });
    expect(await queue.size()).toBe(2);
  });

  it('flushes operations through handlers', async () => {
    await queue.enqueue('answer', 'session-1', { answer: '42' });
    await queue.enqueue('hint', 'session-1', { topic_id: 'intro' });

    const result = await queue.flush({
      answer: async () => ({ ok: true, status: 200 }),
      hint: async () => ({ ok: false, status: 409 }),
    });

    expect(result.synced.length).toBe(1);
    expect(result.conflicts.length).toBe(1);
    expect(await queue.size()).toBe(0);
  });
});
