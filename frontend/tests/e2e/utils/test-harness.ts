import type { Page } from '@playwright/test';
import type {
  CreateSessionResponse,
  RequestHintResponse,
  SubmitAnswerResponse,
  TimerEvent,
} from '../../../src/lib/api-types';

type AnswerMode = 'success' | 'conflict';

export interface TestHarness {
  sessionId: string;
  queueAnswerResponse(response: SubmitAnswerResponse): void;
  setAnswerMode(mode: AnswerMode): void;
  setHintResponses(responses: RequestHintResponse[]): void;
  emitTimer(event: TimerEvent): Promise<void>;
  setNetworkError(value: boolean): Promise<void>;
}

interface HarnessOptions {
  session?: Partial<CreateSessionResponse>;
  answer?: SubmitAnswerResponse;
  hints?: RequestHintResponse[];
}

const defaultAnswer: SubmitAnswerResponse = {
  correct: true,
  score_awarded: 120,
  combo_bonus: 20,
  total_score: 120,
  current_streak: 1,
  feedback: 'Great job',
};

const defaultHints: RequestHintResponse[] = [
  {
    hint: 'short',
    hint_text: 'Подсказка 1',
    hints_used: 1,
    hints_remaining: 2,
    cost: 5,
    new_score: 115,
  },
];

export async function setupTestHarness(
  page: Page,
  options: HarnessOptions = {},
): Promise<TestHarness> {
  const sessionId = options.session?.session_id ?? 'session-e2e';
  const sessionPayload: CreateSessionResponse = {
    session_id: sessionId,
    expires_at: options.session?.expires_at ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    task:
      options.session?.task ??
      ({
        id: 'intro-grammar',
        title: 'E2E lesson',
        description: 'Автотестовое задание',
        time_limit_seconds: 900,
      } as CreateSessionResponse['task']),
  };

  const answerQueue: SubmitAnswerResponse[] = [];
  let answerMode: AnswerMode = 'success';
  let hintQueue = [...(options.hints ?? defaultHints)];
  const explanationResponse = {
    explanation: 'Фиктивное объяснение',
    rule_refs: ['1.1'],
    source: 'cache',
    took_ms: 12,
    generated_at: new Date().toISOString(),
  };
  let forceNetworkError = false;

  await page.addInitScript(() => {
    try {
      window.localStorage?.setItem('tg-onboarding-complete', JSON.stringify({ done: true }));
      window.localStorage?.setItem(
        'tg-user',
        JSON.stringify({ id: 'student-e2e', groupId: 'demo-group', token: '' }),
      );
    } catch (error) {
      console.warn('Unable to seed onboarding flag', error);
    }
  });

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    }
  });

  await page.addInitScript(() => {
    type Listener = (evt: MessageEvent<string>) => void;
    const store = { sources: [] as TestEventSource[] };

    class TestEventSource {
      private listeners = new Map<string, Listener[]>();
      url: string;
      readyState = 1;

      constructor(url: string) {
        this.url = url;
        store.sources.push(this);
      }

      addEventListener(type: string, callback: Listener) {
        const existing = this.listeners.get(type) ?? [];
        existing.push(callback);
        this.listeners.set(type, existing);
      }

      dispatch(type: string, data: unknown) {
        const payload: MessageEvent<string> = {
          data: typeof data === 'string' ? data : JSON.stringify(data),
        } as MessageEvent<string>;
        (this.listeners.get(type) ?? []).forEach((handler) => handler(payload));
      }

      close() {
        this.readyState = 2;
      }
    }

    (window as any).__mockSse = {
      emit(eventType: string, payload: unknown) {
        for (const source of store.sources) {
          source.dispatch(eventType, payload);
        }
      },
    };

    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      writable: true,
      value: TestEventSource,
    });

    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: undefined,
      });
    } catch (error) {
      console.warn('Failed to stub serviceWorker', error);
    }
  });

  await page.route('**/api/v1/sessions/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionPayload),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/v1/sessions/${sessionId}/answers`, async (route) => {
    if (forceNetworkError) {
      await route.abort('failed');
      return;
    }
    if (answerMode === 'conflict') {
      answerMode = 'success';
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Session expired' }),
      });
      return;
    }
    const payload = answerQueue.shift() ?? options.answer ?? defaultAnswer;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route(`**/api/v1/sessions/${sessionId}/hints`, async (route) => {
    if (forceNetworkError) {
      await route.abort('failed');
      return;
    }
    if (!hintQueue.length) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Hint limit reached' }),
      });
      return;
    }
    const response = hintQueue.shift()!;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  await page.route('**/api/explanations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(explanationResponse),
    });
  });

  return {
    sessionId,
    queueAnswerResponse(response: SubmitAnswerResponse) {
      answerQueue.push(response);
    },
    setAnswerMode(mode: AnswerMode) {
      answerMode = mode;
    },
    setHintResponses(responses: RequestHintResponse[]) {
      hintQueue = [...responses];
    },
    emitTimer(event: TimerEvent) {
      const eventName = event.type === 'timer-tick' ? 'timer-tick' : 'time-expired';
      return page.evaluate(
        ([type, payload]) => {
          (window as any).__mockSse?.emit(type, payload);
        },
        [eventName, event] as const,
      );
    },
    async setNetworkError(value: boolean) {
      forceNetworkError = value;
      await page.evaluate(([online]) => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
      }, [!value]);
    },
  };
}
