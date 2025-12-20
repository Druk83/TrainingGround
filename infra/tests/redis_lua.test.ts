/**
 * Redis Lua Scripts Tests
 * Run with: npm test (requires ioredis)
 */

import { readFileSync } from 'fs';
import Redis from 'ioredis';
import { join } from 'path';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redispass',
});

const purchaseHintScript = readFileSync(join(__dirname, '../redis/purchase_hint.lua'), 'utf-8');
const scoreSeriesScript = readFileSync(join(__dirname, '../redis/score_series.lua'), 'utf-8');
const anticheatScript = readFileSync(join(__dirname, '../redis/anticheat_check.lua'), 'utf-8');

describe('Redis Lua скрипты', () => {
  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('purchase_hint.lua', () => {
    it('должен успешно выдать первую подсказку', async () => {
      const sessionId = 'test-session-1';
      const userId = 'user-123';
      const taskId = 'task-456';

      // Setup session
      await redis.hset(`session:${sessionId}`, 'user_id', userId, 'task_id', taskId);
      await redis.expire(`session:${sessionId}`, 3600);

      // Purchase hint
      const result = await redis.eval(
        purchaseHintScript,
        3,
        `session:${sessionId}`,
        `hints_used:${sessionId}`,
        `hint:cooldown:${userId}:${taskId}`,
        3, // max_hints
        5  // cooldown_seconds
      );

      expect(result).toBe(1);

      // Verify cooldown
      const cooldown = await redis.get(`hint:cooldown:${userId}:${taskId}`);
      expect(cooldown).toBe('locked');
    });

    it('должен отклонить запрос во время перезарядки', async () => {
      const sessionId = 'test-session-2';
      const userId = 'user-123';
      const taskId = 'task-456';

      await redis.hset(`session:${sessionId}`, 'user_id', userId);
      await redis.setex(`hint:cooldown:${userId}:${taskId}`, 5, 'locked');

      try {
        await redis.eval(
          purchaseHintScript,
          3,
          `session:${sessionId}`,
          `hints_used:${sessionId}`,
          `hint:cooldown:${userId}:${taskId}`,
          3,
          5
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('ERR:COOLDOWN_ACTIVE');
      }
    });

    it('должен отклонить при достижении максимума подсказок', async () => {
      const sessionId = 'test-session-3';
      const userId = 'user-123';
      const taskId = 'task-456';

      await redis.hset(`session:${sessionId}`, 'user_id', userId);
      await redis.set(`hints_used:${sessionId}`, 3);

      try {
        await redis.eval(
          purchaseHintScript,
          3,
          `session:${sessionId}`,
          `hints_used:${sessionId}`,
          `hint:cooldown:${userId}:${taskId}`,
          3, // max = 3, already used 3
          5
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('ERR:MAX_HINTS_REACHED');
      }
    });
  });

  describe('score_series.lua', () => {
    it('должен строить серию оценок и отслеживать streak', async () => {
      const userId = 'user-123';

      // Sequence: correct, correct, incorrect, correct
      let result = await redis.eval(
        scoreSeriesScript,
        2,
        `score:series:${userId}`,
        `score:streak:${userId}`,
        1, // correct
        100
      ) as number[];
      expect(result).toEqual([1, 1]); // 1 item in series, streak = 1

      result = await redis.eval(
        scoreSeriesScript,
        2,
        `score:series:${userId}`,
        `score:streak:${userId}`,
        1,
        100
      ) as number[];
      expect(result).toEqual([2, 2]); // 2 items, streak = 2

      result = await redis.eval(
        scoreSeriesScript,
        2,
        `score:series:${userId}`,
        `score:streak:${userId}`,
        0, // incorrect
        100
      ) as number[];
      expect(result).toEqual([3, 0]); // 3 items, streak reset to 0

      result = await redis.eval(
        scoreSeriesScript,
        2,
        `score:series:${userId}`,
        `score:streak:${userId}`,
        1,
        100
      ) as number[];
      expect(result).toEqual([4, 1]); // 4 items, streak = 1
    });

    it('должен обрезать серию до максимальной длины', async () => {
      const userId = 'user-456';
      const maxLength = 10;

      // Add 15 results
      for (let i = 0; i < 15; i++) {
        await redis.eval(
          scoreSeriesScript,
          2,
          `score:series:${userId}`,
          `score:streak:${userId}`,
          1,
          maxLength
        );
      }

      const length = await redis.llen(`score:series:${userId}`);
      expect(length).toBe(maxLength);
    });
  });

  describe('anticheat_check.lua', () => {
    it('должен отслеживать события без блокировки', async () => {
      const userId = 'user-123';

      const result = await redis.eval(
        anticheatScript,
        2,
        `anticheat:${userId}`,
        `anticheat:block:${userId}`,
        'tab_switch',
        Date.now().toString(),
        5 // threshold
      ) as number[];

      expect(result[0]).toBe(0); // not blocked
      expect(result[1]).toBe(1); // event count = 1
      expect(result[2]).toBe(0); // no block duration
    });

    it('должен заблокировать пользователя после превышения порога', async () => {
      const userId = 'user-789';
      const timestamp = Date.now();

      // Trigger 5 tab switches (threshold)
      for (let i = 0; i < 5; i++) {
        await redis.eval(
          anticheatScript,
          2,
          `anticheat:${userId}`,
          `anticheat:block:${userId}`,
          'tab_switch',
          (timestamp + i * 1000).toString(),
          5
        );
      }

      // Next attempt should be blocked
      const result = await redis.eval(
        anticheatScript,
        2,
        `anticheat:${userId}`,
        `anticheat:block:${userId}`,
        'tab_switch',
        (timestamp + 6000).toString(),
        5
      ) as number[];

      expect(result[0]).toBe(1); // blocked
      expect(result[2]).toBeGreaterThan(0); // has block duration
    });

    it('должен сохранять статус блокировки между проверками', async () => {
      const userId = 'user-blocked';

      // Manually block
      await redis.setex(`anticheat:block:${userId}`, 900, 'blocked');

      const result = await redis.eval(
        anticheatScript,
        2,
        `anticheat:${userId}`,
        `anticheat:block:${userId}`,
        'tab_switch',
        Date.now().toString(),
        5
      ) as number[];

      expect(result[0]).toBe(1); // still blocked
      expect(result[2]).toBeLessThanOrEqual(900);
    });
  });
});
