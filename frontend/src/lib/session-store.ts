import { nanoid } from 'nanoid';
import type {
  CreateSessionResponse,
  RequestHintResponse,
  SessionResponse,
  SubmitAnswerResponse,
  TimerEvent,
} from './api-types';
import { ApiClient } from './api-client';
import {
  OfflineQueue,
  type OfflineOperation,
  type OfflineQueueEvent,
} from './offline-queue';
import { sendAnalyticsEvent } from './analytics';
import { TimerStream } from './timer-stream';
import { lessonCatalog, type LessonDefinition } from './lesson-catalog';
import { isFeatureEnabled } from './feature-flags';
import { requestExplanation } from '@/services/explanations';
import { readFromStorage, writeToStorage, STORAGE_KEYS } from './storage';
import { applyHintPenalty, calculateAnswerScore, HINT_PENALTY } from './scoring';

export interface LessonCard extends LessonDefinition {
  status: 'locked' | 'available' | 'active' | 'completed';
  progress: number;
  levelsCompleted: number;
  percentCorrect: number;
}

export interface HintEntry {
  id: string;
  text: string;
  cost: number;
  source: RequestHintResponse['hint'];
  timestamp: number;
}

export interface ExplanationEntry {
  id: string;
  text: string;
  ruleRefs: string[];
  source: string;
  tookMs: number;
  generatedAt: string;
}

export interface TimerState {
  status: 'idle' | 'running' | 'expired';
  remainingSeconds: number;
  totalSeconds: number;
  lastUpdated?: string;
}

export interface ScoreState {
  totalScore: number;
  attempts: number;
  correct: number;
  accuracy: number;
  currentStreak: number;
  longestStreak: number;
  hintsUsed: number;
  hintsRemaining?: number;
  lastScoreDelta?: number;
  lastBonusApplied?: boolean;
  lastHintPenalty?: number;
}

export const MAX_HINTS_PER_SESSION = 2;

export interface UserState {
  id: string;
  groupId?: string;
  token?: string;
}

export interface ConnectionState {
  online: boolean;
  queueSize: number;
  syncing: boolean;
  lastSyncAt?: string;
  conflicts: number;
  statusMessage?: string;
}

export type ConflictResolution = 'accept-server' | 'keep-local' | 'dismiss';

export interface LessonStoreSnapshot {
  lessons: LessonCard[];
  user: UserState;
  activeSession?: {
    id: string;
    taskId: string;
    title: string;
    description: string;
    expiresAt: string;
    startedAt: string;
    answerDraft: string;
  };
  timer: TimerState;
  scoreboard: ScoreState;
  hints: {
    items: HintEntry[];
    explanations: ExplanationEntry[];
    isLoading: boolean;
    error?: string;
  };
  notifications: {
    id: string;
    tone: 'info' | 'success' | 'error' | 'warning';
    text: string;
  }[];
  conflicts: OfflineOperation[];
  connection: ConnectionState;
  onboardingComplete: boolean;
}

export type LessonStoreListener = (snapshot: LessonStoreSnapshot) => void;

const defaultScore: ScoreState = {
  totalScore: 0,
  attempts: 0,
  correct: 0,
  accuracy: 0,
  currentStreak: 0,
  longestStreak: 0,
  hintsUsed: 0,
  hintsRemaining: undefined,
  lastScoreDelta: 0,
  lastBonusApplied: false,
  lastHintPenalty: undefined,
};

const defaultTimer: TimerState = {
  status: 'idle',
  remainingSeconds: 0,
  totalSeconds: 0,
};

export class LessonStore {
  private state: LessonStoreSnapshot;
  private listeners = new Set<LessonStoreListener>();
  private api = new ApiClient();
  private offlineQueue = new OfflineQueue();
  private timer = new TimerStream();
  private currentLesson?: LessonDefinition;
  private analyticsBuffer: number[] = [];
  private lastKeypressAt = 0;
  private autoSubmittedOnTimeout = false;

  constructor() {
    const storedUser = readFromStorage<UserState>(STORAGE_KEYS.user, {
      id: '',
      groupId: '',
      token: '',
    });
    const onboarding = readFromStorage<{ done: boolean }>(STORAGE_KEYS.onboarding, {
      done: false,
    });

    this.api.setToken(storedUser.token);

    this.state = {
      lessons: this.computeLessons(defaultScore, undefined),
      user: storedUser,
      activeSession: undefined,
      timer: defaultTimer,
      scoreboard: { ...defaultScore },
      hints: { items: [], explanations: [], isLoading: false },
      notifications: [],
      conflicts: [],
      onboardingComplete: onboarding.done,
      connection: {
        online: navigator.onLine,
        queueSize: 0,
        syncing: false,
        conflicts: 0,
      },
    };

    this.offlineQueue.onEvent((event) => this.handleOfflineQueueEvent(event));

    this.timer.subscribe((event) => this.handleTimerEvent(event));

    window.addEventListener('online', () => this.updateConnection(true));
    window.addEventListener('offline', () => this.updateConnection(false));

    this.refreshQueueSize();

    if (navigator.onLine) {
      void this.flushOfflineQueue();
    }
  }

  subscribe(listener: LessonStoreListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  get snapshot() {
    return this.state;
  }

  setUser(user: Partial<UserState>) {
    const updated = { ...this.state.user, ...user };
    this.api.setToken(updated.token);
    writeToStorage(STORAGE_KEYS.user, updated);
    this.patch({ user: updated });
  }

  setOnboardingComplete() {
    writeToStorage(STORAGE_KEYS.onboarding, { done: true });
    this.patch({ onboardingComplete: true });
  }

  async startSession(lessonId: string) {
    const lesson = lessonCatalog.find((l) => l.id === lessonId);
    if (!lesson || this.state.user.id.length === 0) {
      throw new Error('lesson or user is missing');
    }

    this.currentLesson = lesson;
    try {
      const response = await this.api.createSession({
        user_id: this.state.user.id,
        task_id: lesson.id,
        group_id: this.state.user.groupId,
      });
      this.handleSessionCreated(response, lesson);
    } catch (error) {
      this.pushNotification(
        'error',
        'Ошибка при создании сессии: ' + (error as Error).message,
      );
    }
  }

  async refreshSession(sessionId: string) {
    try {
      const session = await this.api.getSession(sessionId);
      this.patch({
        activeSession: this.mapSessionToActive(session),
        timer: this.state.timer.status === 'idle' ? this.state.timer : this.state.timer,
      });
    } catch (error) {
      this.pushNotification(
        'error',
        'Ошибка при обновлении сессии: ' + (error as Error).message,
      );
    }
  }

  async submitAnswer(answer: string) {
    const session = this.state.activeSession;
    if (!session) {
      return;
    }

    const payload = { answer };
    try {
      const response = await this.api.submitAnswer(session.id, payload);
      this.handleAnswerResult(response);
    } catch (error) {
      if (!navigator.onLine && isFeatureEnabled('offlineQueue')) {
        await this.offlineQueue.enqueue('answer', session.id, payload);
        this.pushNotification('warning', 'Ответ добавлен в очередь для синхронизации');
        await this.refreshQueueSize();
      } else {
        this.pushNotification('error', (error as Error).message);
      }
    }
  }

  async requestHint() {
    const session = this.state.activeSession;
    if (!session) {
      return;
    }

    if (this.state.scoreboard.hintsUsed >= MAX_HINTS_PER_SESSION) {
      this.patch({
        hints: {
          ...this.state.hints,
          isLoading: false,
          error: 'Лимит подсказок на уровне исчерпан',
        },
      });
      this.pushNotification('warning', 'Лимит подсказок достигнут');
      return;
    }

    const previousScoreboard = { ...this.state.scoreboard };
    this.applyHintCostPreview();
    this.patch({ hints: { ...this.state.hints, isLoading: true, error: undefined } });

    try {
      const response = await this.api.requestHint(session.id, {
        topic_id: this.currentLesson?.topicId,
      });
      this.handleHintResponse(response);
      await this.tryLoadExplanation(response.hint_text);
    } catch (error) {
      if (!navigator.onLine && isFeatureEnabled('offlineQueue')) {
        await this.offlineQueue.enqueue('hint', session.id, {
          topic_id: this.currentLesson?.topicId,
        });
        this.pushNotification(
          'warning',
          'Подсказка добавлена в очередь для синхронизации',
        );
        this.patch({
          hints: {
            ...this.state.hints,
            isLoading: false,
            error: undefined,
          },
        });
        await this.refreshQueueSize();
        return;
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Неизвестная ошибка при запросе подсказки';
      this.patch({
        hints: {
          ...this.state.hints,
          isLoading: false,
          error: errorMessage,
        },
        scoreboard: previousScoreboard,
      });
    }
  }

  private applyHintCostPreview() {
    const hintsUsed = this.state.scoreboard.hintsUsed + 1;
    const remaining =
      typeof this.state.scoreboard.hintsRemaining === 'number'
        ? Math.max(0, this.state.scoreboard.hintsRemaining - 1)
        : Math.max(0, MAX_HINTS_PER_SESSION - hintsUsed);

    const scoreboard = {
      ...this.state.scoreboard,
      hintsUsed,
      hintsRemaining: remaining,
      totalScore: applyHintPenalty(this.state.scoreboard.totalScore),
      lastScoreDelta: -HINT_PENALTY,
      lastBonusApplied: false,
      lastHintPenalty: HINT_PENALTY,
    };

    this.patch({ scoreboard });
  }

  async flushOfflineQueue() {
    if (!isFeatureEnabled('offlineQueue')) {
      return;
    }
    this.updateSync(true, 'Синхронизация офлайн-очереди...');
    const result = await this.offlineQueue.flush({
      answer: async (operation) => {
        try {
          const response = await this.api.submitAnswer(
            operation.sessionId,
            operation.payload as { answer: string },
          );
          this.handleAnswerResult(response);
          return { ok: true, status: 200 };
        } catch (error) {
          return {
            ok: false,
            status:
              error instanceof Error && error.message.includes('expired') ? 409 : 500,
          };
        }
      },
      hint: async (operation) => {
        try {
          const response = await this.api.requestHint(
            operation.sessionId,
            operation.payload,
          );
          this.handleHintResponse(response);
          await this.tryLoadExplanation(response.hint_text);
          return { ok: true, status: 200 };
        } catch (_error) {
          return { ok: false, status: 500 };
        }
      },
    });
    this.updateSync(
      false,
      result.conflicts.length > 0 ? 'Обнаружены конфликты при синхронизации' : undefined,
      result.conflicts.length,
    );
    await this.refreshQueueSize();
  }

  async resolveConflict(operationId: string, resolution: ConflictResolution) {
    const conflict = this.state.conflicts.find((item) => item.id === operationId);
    if (!conflict) {
      return;
    }
    const remaining = this.state.conflicts.filter((item) => item.id !== operationId);
    this.patch({ conflicts: remaining });
    this.updateSync(
      false,
      remaining.length
        ? 'Есть конфликты синхронизации — решите их вручную'
        : 'Конфликтов больше нет',
      remaining.length,
    );
    if (resolution === 'keep-local') {
      await this.offlineQueue.enqueue(
        conflict.type,
        conflict.sessionId,
        conflict.payload,
      );
      this.pushNotification('info', 'Локальная версия сохранена и отправлена повторно');
      await this.refreshQueueSize();
    } else if (resolution === 'accept-server') {
      this.pushNotification('success', 'Принята серверная версия данных');
    } else {
      this.pushNotification('info', 'Конфликт отклонён');
    }
  }

  clearConflicts() {
    if (!this.state.conflicts.length) {
      return;
    }
    this.patch({ conflicts: [] });
    this.updateSync(false, 'Конфликтов больше нет', 0);
  }

  trackKeypress() {
    const now = performance.now();
    if (this.lastKeypressAt > 0) {
      this.analyticsBuffer.push(now - this.lastKeypressAt);
    }
    this.lastKeypressAt = now;

    if (this.analyticsBuffer.length >= 10 && this.state.activeSession) {
      const avg =
        this.analyticsBuffer.reduce((acc, item) => acc + item, 0) /
        this.analyticsBuffer.length;
      sendAnalyticsEvent({
        sessionId: this.state.activeSession.id,
        userId: this.state.user.id,
        averageKeypressMs: Math.round(avg),
        burstKeypresses: this.analyticsBuffer.length,
        source: navigator.onLine ? 'ui' : 'offline-sync',
        recordedAt: new Date().toISOString(),
      });
      this.analyticsBuffer = [];
    }
  }

  private handleSessionCreated(
    response: CreateSessionResponse,
    lesson: LessonDefinition,
  ) {
    const activeSession = {
      id: response.session_id,
      taskId: response.task?.id ?? lesson.id,
      title: response.task?.title ?? lesson.title,
      description: response.task?.description ?? lesson.summary,
      expiresAt: response.expires_at,
      startedAt: new Date().toISOString(),
      answerDraft: '',
    };

    this.timer.connect(response.session_id);
    const totalSeconds = response.task?.time_limit_seconds ?? lesson.durationMinutes * 60;
    this.patch({
      activeSession,
      timer: {
        status: 'running',
        totalSeconds,
        remainingSeconds: totalSeconds,
        lastUpdated: new Date().toISOString(),
      },
      lessons: this.computeLessons(this.state.scoreboard, lesson.id),
    });
    this.autoSubmittedOnTimeout = false;
  }

  private handleAnswerResult(result: SubmitAnswerResponse) {
    const prevScoreboard = this.state.scoreboard;
    const scoring = calculateAnswerScore({
      correct: result.correct,
      currentStreak: prevScoreboard.currentStreak,
    });
    const attempts = prevScoreboard.attempts + 1;
    const correct = result.correct ? prevScoreboard.correct + 1 : prevScoreboard.correct;
    const accuracy = attempts === 0 ? 0 : Math.round((correct / attempts) * 100);
    const longestStreak = Math.max(prevScoreboard.longestStreak, scoring.newStreak);
    const delta = result.total_score - prevScoreboard.totalScore;

    const scoreboard = {
      ...prevScoreboard,
      attempts,
      correct,
      accuracy,
      currentStreak: scoring.newStreak,
      longestStreak,
      totalScore: result.total_score,
      lastScoreDelta: delta,
      lastBonusApplied: scoring.bonusApplied,
      lastHintPenalty: undefined,
    };

    this.patch({
      scoreboard,
      lessons: this.computeLessons(scoreboard, this.state.activeSession?.taskId),
    });

    if (!result.correct) {
      this.pushNotification('warning', 'Ответ неверный. Попробуйте еще раз.');
    } else {
      this.pushNotification('success', 'Ответ верный! Отлично справились.');
    }
  }

  private handleHintResponse(response: RequestHintResponse) {
    const entry: HintEntry = {
      id: nanoid(),
      text: response.hint_text,
      cost: response.cost,
      source: response.hint,
      timestamp: Date.now(),
    };

    const scoreboard = {
      ...this.state.scoreboard,
      totalScore: response.new_score,
      hintsUsed: response.hints_used,
      hintsRemaining: response.hints_remaining,
    };

    this.patch({
      hints: {
        items: [...this.state.hints.items, entry],
        explanations: this.state.hints.explanations,
        isLoading: false,
        error: undefined,
      },
      scoreboard,
      lessons: this.computeLessons(scoreboard, this.state.activeSession?.taskId),
    });
  }

  private async tryLoadExplanation(hintText: string) {
    if (!this.state.activeSession) {
      return;
    }

    try {
      const explanation = await requestExplanation({
        taskId: this.state.activeSession.taskId,
        topicId: this.currentLesson?.topicId,
        userErrors: [hintText],
        requestId: nanoid(),
      });

      const entry: ExplanationEntry = {
        id: nanoid(),
        text: explanation.explanation,
        ruleRefs: explanation.ruleRefs,
        source: explanation.source,
        tookMs: explanation.tookMs,
        generatedAt: explanation.generatedAt,
      };

      this.patch({
        hints: {
          ...this.state.hints,
          explanations: [...this.state.hints.explanations, entry],
        },
      });
    } catch (error) {
      console.warn('Failed to load explanation', error);
    }
  }

  private handleTimerEvent(event: TimerEvent) {
    if (event.type === 'timer-tick') {
      this.patch({
        timer: {
          status: 'running',
          totalSeconds: event.total_seconds,
          remainingSeconds: event.remaining_seconds,
          lastUpdated: event.timestamp,
        },
      });
    } else {
      if (!this.autoSubmittedOnTimeout) {
        this.autoSubmittedOnTimeout = true;
        void this.submitAnswer('');
      }
      this.patch({
        timer: {
          ...this.state.timer,
          status: 'expired',
          remainingSeconds: 0,
          lastUpdated: event.timestamp,
        },
      });
      this.pushNotification('warning', 'Время сессии истекло');
    }
  }
  private handleOfflineQueueEvent(event: OfflineQueueEvent) {
    if (event.type === 'synced') {
      this.updateSync(
        false,
        'Синхронизация офлайн-очереди завершена',
        this.state.connection.conflicts,
      );
    }
    if (event.type === 'conflict') {
      const existing = new Set(this.state.conflicts.map((item) => item.id));
      const incoming = event.operations.filter((op) => !existing.has(op.id));
      if (incoming.length) {
        const conflicts = [...this.state.conflicts, ...incoming];
        this.patch({ conflicts });
        this.pushNotification(
          'warning',
          `Обнаружено ${incoming.length} конфликт(а), выберите решение`,
        );
        this.updateSync(
          false,
          'Есть конфликты синхронизации — решите их вручную',
          conflicts.length,
        );
      } else {
        this.updateSync(
          false,
          'Есть конфликты синхронизации — решите их вручную',
          this.state.connection.conflicts,
        );
      }
    }
    void this.refreshQueueSize();
  }

  private updateConnection(online: boolean) {
    this.patch({
      connection: {
        ...this.state.connection,
        online,
        statusMessage: online ? 'Подключение восстановлено' : 'Нет подключения',
      },
    });
    if (online) {
      void this.flushOfflineQueue();
    }
  }

  private updateSync(syncing: boolean, message?: string, conflictsCount?: number) {
    this.patch({
      connection: {
        ...this.state.connection,
        syncing,
        statusMessage: message ?? this.state.connection.statusMessage,
        lastSyncAt: !syncing
          ? new Date().toISOString()
          : this.state.connection.lastSyncAt,
        conflicts: conflictsCount ?? this.state.connection.conflicts,
      },
    });
  }

  private async refreshQueueSize() {
    const size = await this.offlineQueue.size();
    this.patch({
      connection: {
        ...this.state.connection,
        queueSize: size,
      },
    });
  }

  private computeLessons(score: ScoreState, activeLessonId?: string) {
    return lessonCatalog.map((lesson, index) => {
      const isFirst = index === 0;
      const unlocked = score.accuracy >= 80 || isFirst;
      let status: LessonCard['status'] = unlocked ? 'available' : 'locked';
      if (activeLessonId === lesson.id) {
        status = 'active';
      }
      const percentCorrect = score.accuracy;
      const levelsCompleted = Math.min(
        lesson.levels,
        Math.round((percentCorrect / 100) * lesson.levels),
      );
      const progress =
        lesson.levels > 0
          ? Math.min(100, Math.round((levelsCompleted / lesson.levels) * 100))
          : 0;
      const statusFinal = (
        levelsCompleted >= lesson.levels && status !== 'active' ? 'completed' : status
      ) as LessonCard['status'];
      return {
        ...lesson,
        status: statusFinal,
        progress,
        levelsCompleted,
        percentCorrect,
      };
    });
  }

  private mapSessionToActive(session: SessionResponse) {
    return {
      id: session.id,
      taskId: session.task_id,
      title: this.currentLesson?.title ?? session.task_id,
      description: this.currentLesson?.summary ?? '',
      expiresAt: session.expires_at,
      startedAt: session.started_at,
      answerDraft: '',
    };
  }

  private pushNotification(tone: 'info' | 'success' | 'error' | 'warning', text: string) {
    const notification = { id: nanoid(), tone, text };
    const notifications = [...this.state.notifications.slice(-2), notification];
    this.patch({ notifications });
  }

  private patch(partial: Partial<LessonStoreSnapshot>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const lessonStore = new LessonStore();

if (typeof window !== 'undefined') {
  (window as unknown as { __lessonStore__?: LessonStore }).__lessonStore__ = lessonStore;
}
