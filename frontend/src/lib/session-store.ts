import { requestExplanation } from '@/services/explanations';
import { nanoid } from 'nanoid';
import { sendAnalyticsEvent } from './analytics';
import { ApiClient } from './api-client';
import type {
  CreateSessionResponse,
  RequestHintResponse,
  SessionResponse,
  StudentCourseSummary,
  SubmitAnswerResponse,
  TimerEvent,
} from './api-types';
import { isFeatureEnabled } from './feature-flags';
import { lessonCatalog, type LessonDefinition } from './lesson-catalog';
import {
  OfflineQueue,
  type OfflineOperation,
  type OfflineQueueEvent,
} from './offline-queue';
import { applyHintPenalty, HINT_PENALTY } from './scoring';
import { readFromStorage, STORAGE_KEYS, writeToStorage } from './storage';
import { TimerStream } from './timer-stream';

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

export interface SessionProgress {
  currentStep: number;
  totalSteps: number;
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
    lessonId: string;
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
  sessionProgress: SessionProgress;
  lastCompletedLessonId?: string;
  lastCompletedLessonTitle?: string;
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

const defaultSessionProgress: SessionProgress = {
  currentStep: 0,
  totalSteps: 0,
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
  private useCourseCatalog = false;

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
      lastCompletedLessonId: undefined,
      lastCompletedLessonTitle: undefined,
      sessionProgress: { ...defaultSessionProgress },
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

    // Load student stats on initialization if user is authenticated
    if (storedUser.token) {
      void this.loadStudentStats();
    }
  }

  private async loadStudentStats(): Promise<void> {
    try {
      const stats = await this.api.getStudentStats();

      const scoreboard: ScoreState = {
        totalScore: stats.total_score,
        attempts: stats.attempts_total,
        correct: stats.correct_total,
        accuracy: Math.round(stats.accuracy * 100) / 100, // Round to 2 decimal places
        currentStreak: stats.current_streak,
        longestStreak: 0, // Backend doesn't provide this currently
        hintsUsed: stats.hints_used,
        hintsRemaining: undefined,
        lastScoreDelta: 0,
        lastBonusApplied: false,
        lastHintPenalty: undefined,
      };

      this.patch({ scoreboard });
    } catch (err) {
      console.warn('Failed to load student stats on initialization:', err);
      // Silently fail - use default scores
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

  setCourses(courses: StudentCourseSummary[]) {
    const lessons = courses.map((course) => this.mapCourseToLesson(course));
    this.useCourseCatalog = lessons.length > 0;
    if (!this.useCourseCatalog) {
      return;
    }
    this.patch({
      lessons: this.applyActiveLesson(lessons, this.state.activeSession?.lessonId),
    });
  }

  notify(tone: 'info' | 'success' | 'error' | 'warning', text: string) {
    this.pushNotification(tone, text);
  }

  async startSession(lessonId: string) {
    const lesson = this.findLessonDefinition(lessonId);
    if (!lesson || this.state.user.id.length === 0) {
      throw new Error('lesson or user is missing');
    }

    this.currentLesson = lesson;
    if (this.useCourseCatalog) {
      try {
        await this.api.fetchCsrfToken();
        const response = await this.api.startStudentSession(lesson.id);
        this.handleSessionCreated(response, lesson);
      } catch (error) {
        this.pushNotification(
          'error',
          'Не удалось запустить генератор заданий: ' + (error as Error).message,
        );
      }
      return;
    }

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

  async startCourseSession(course: StudentCourseSummary) {
    if (!course || this.state.user.id.length === 0) {
      this.pushNotification('warning', 'Невозможно определить пользователя или курс');
      return;
    }

    await this.api.fetchCsrfToken();
    const lesson: LessonDefinition = {
      id: course.id,
      title: course.title,
      summary: course.description,
      difficulty: course.difficulty,
      durationMinutes: Math.max(5, Math.round(course.total_tasks * 3)),
      topicId: course.topic_id,
      levels: Math.max(1, course.total_tasks),
    };

    this.currentLesson = lesson;
    this.useCourseCatalog = true;
    this.patch({
      lessons: this.applyActiveLesson(
        this.state.lessons.length ? this.state.lessons : [this.mapCourseToLesson(course)],
        lesson.id,
      ),
    });
    try {
      const response = await this.api.startStudentSession(course.id);
      this.handleSessionCreated(response, lesson);
    } catch (error) {
      this.pushNotification(
        'error',
        'Не удалось запустить генератор заданий: ' + (error as Error).message,
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
      lessonId: lesson.id,
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
      lessons: this.getUpdatedLessons(this.state.scoreboard, lesson.id),
      sessionProgress: {
        currentStep: 1,
        totalSteps: Math.max(1, lesson.levels ?? 1),
      },
    });
    this.autoSubmittedOnTimeout = false;
  }

  private handleAnswerResult(result: SubmitAnswerResponse) {
    const prevScoreboard = this.state.scoreboard;

    // Use streak from backend (which is the source of truth)
    const currentStreak = result.current_streak;

    const attempts = prevScoreboard.attempts + 1;
    const correct = result.correct ? prevScoreboard.correct + 1 : prevScoreboard.correct;
    const accuracy = attempts === 0 ? 0 : Math.round((correct / attempts) * 100);
    const longestStreak = Math.max(prevScoreboard.longestStreak, currentStreak);
    const delta = result.total_score - prevScoreboard.totalScore;

    const scoreboard = {
      ...prevScoreboard,
      attempts,
      correct,
      accuracy,
      currentStreak,
      longestStreak,
      totalScore: result.total_score,
      lastScoreDelta: delta,
      lastBonusApplied: result.combo_bonus > 0,
      lastHintPenalty: undefined,
    };
    const progress = this.state.sessionProgress;
    const totalSteps = progress.totalSteps || this.currentLesson?.levels || 1;
    const nextStep = result.correct
      ? Math.min(totalSteps, Math.max(progress.currentStep, 1) + 1)
      : progress.currentStep || 1;

    const lessons = this.useCourseCatalog
      ? this.updateLessonProgressFromScore(scoreboard)
      : this.getUpdatedLessons(scoreboard, this.state.activeSession?.lessonId);

    this.patch({
      scoreboard,
      sessionProgress: {
        currentStep: nextStep,
        totalSteps,
      },
      lessons,
    });

    const fallback = result.correct
      ? 'Ответ верный! Отлично справились.'
      : 'Ответ неверный. Попробуйте ещё раз.';
    const message = result.feedback?.trim() ? result.feedback.trim() : fallback;
    this.pushNotification(result.correct ? 'success' : 'warning', message);

    const reachedLimit = totalSteps > 0 && scoreboard.attempts >= totalSteps;
    if (reachedLimit) {
      const passed = scoreboard.accuracy >= 80;
      this.completeActiveSession(
        passed
          ? 'Урок завершён — можно переходить к следующему.'
          : 'Урок завершён, но для зачёта нужно 80% правильных.',
      );
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
      lessons: this.getUpdatedLessons(scoreboard, this.state.activeSession?.lessonId),
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
        this.completeActiveSession('Время сессии истекло. Возвращаемся к каталогу.');
      } else {
        this.patch({
          timer: {
            ...this.state.timer,
            status: 'expired',
            remainingSeconds: 0,
            lastUpdated: event.timestamp,
          },
        });
      }
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
    let statusMessage =
      typeof message === 'string' ? message : this.state.connection.statusMessage;
    if (!syncing && typeof message !== 'string') {
      const hadSyncMessage =
        statusMessage?.toLowerCase().includes('синхронизац') ?? false;
      if (hadSyncMessage && !(conflictsCount && conflictsCount > 0)) {
        statusMessage = undefined;
      }
    }
    this.patch({
      connection: {
        ...this.state.connection,
        syncing,
        statusMessage,
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

  private computeLessons(score: ScoreState, activeLessonId?: string): LessonCard[] {
    return lessonCatalog.map((lesson, index): LessonCard => {
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

  private mapCourseToLesson(course: StudentCourseSummary): LessonCard {
    const totalTasks = Math.max(1, course.total_tasks);
    const percentCorrect = Math.min(100, Math.max(0, Math.round(course.progress ?? 0)));
    const levelsCompleted = Math.min(
      totalTasks,
      Math.round((percentCorrect / 100) * totalTasks),
    );
    const statusMap: Record<StudentCourseSummary['status'], LessonCard['status']> = {
      new: 'available',
      in_progress: 'available',
      completed: 'completed',
    };
    const mappedStatus = statusMap[course.status] ?? 'available';
    const status: LessonCard['status'] = mappedStatus;

    return {
      id: course.id,
      title: course.title,
      summary: course.description,
      difficulty: course.difficulty,
      durationMinutes: Math.max(5, Math.round(course.total_tasks * 3)),
      topicId: course.topic_id ?? course.level_id ?? undefined,
      levels: totalTasks,
      status,
      progress: percentCorrect,
      levelsCompleted,
      percentCorrect,
    };
  }

  private applyActiveLesson(
    lessons: LessonCard[],
    activeLessonId?: string,
  ): LessonCard[] {
    if (!activeLessonId) {
      return lessons;
    }
    return lessons.map(
      (lesson): LessonCard =>
        lesson.id === activeLessonId ? { ...lesson, status: 'active' } : lesson,
    );
  }

  private getUpdatedLessons(
    scoreboard: ScoreState,
    activeLessonId?: string,
  ): LessonCard[] {
    if (this.useCourseCatalog) {
      return this.applyActiveLesson(this.state.lessons, activeLessonId);
    }
    return this.computeLessons(scoreboard, activeLessonId);
  }

  private updateLessonProgressFromScore(scoreboard: ScoreState): LessonCard[] {
    if (!this.currentLesson) {
      return this.state.lessons;
    }

    return this.state.lessons.map((lesson) => {
      if (lesson.id !== this.currentLesson?.id) {
        return lesson;
      }

      const levelsCompleted = Math.min(lesson.levels, scoreboard.attempts);
      const completionPercent =
        lesson.levels > 0
          ? Math.min(100, Math.round((levelsCompleted / lesson.levels) * 100))
          : 0;
      const fullyCompleted = lesson.levels > 0 && levelsCompleted >= lesson.levels;
      let status: LessonCard['status'] = fullyCompleted ? 'available' : 'active';
      if (fullyCompleted && scoreboard.accuracy >= 80) {
        status = 'completed';
      }

      return {
        ...lesson,
        percentCorrect: scoreboard.accuracy,
        progress: completionPercent,
        levelsCompleted,
        status,
      };
    });
  }

  private findLessonDefinition(lessonId: string) {
    if (this.useCourseCatalog) {
      return this.state.lessons.find((lesson) => lesson.id === lessonId);
    }
    return lessonCatalog.find((lesson) => lesson.id === lessonId);
  }

  private mapSessionToActive(session: SessionResponse) {
    return {
      id: session.id,
      lessonId: this.currentLesson?.id ?? session.task_id,
      taskId: session.task_id,
      title: this.currentLesson?.title ?? session.task_id,
      description: this.currentLesson?.summary ?? '',
      expiresAt: session.expires_at,
      startedAt: session.started_at,
      answerDraft: '',
    };
  }

  private completeActiveSession(message?: string) {
    if (!this.state.activeSession) {
      return;
    }
    this.timer.disconnect();
    this.patch({
      activeSession: undefined,
      timer: {
        ...this.state.timer,
        status: 'expired',
        remainingSeconds: 0,
        lastUpdated: new Date().toISOString(),
      },
      lastCompletedLessonId: this.currentLesson?.id ?? this.state.lastCompletedLessonId,
      lastCompletedLessonTitle:
        this.currentLesson?.title ?? this.state.lastCompletedLessonTitle,
    });
    if (message) {
      this.pushNotification('info', message);
    }
  }

  private pushNotification(tone: 'info' | 'success' | 'error' | 'warning', text: string) {
    const notification = { id: nanoid(), tone, text };
    const notifications = [...this.state.notifications.slice(-2), notification];
    this.patch({ notifications });
  }

  clearNotifications() {
    if (this.state.notifications.length) {
      this.patch({ notifications: [] });
    }
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
