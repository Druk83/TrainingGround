import '@/components/conflict-resolver';
import '@/components/connection-indicator';
import '@/components/hint-panel';
import '@/components/lesson-catalog';
import '@/components/lesson-player';
import '@/components/lesson-results';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
  type ConflictResolution,
  lessonStore,
  type LessonStoreSnapshot,
  MAX_HINTS_PER_SESSION,
  type ScoreState,
  type TimerState,
} from '@/lib/session-store';
import { css, html, LitElement, PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { Question } from '@/components/question-renderer';

// Reserved for future state management (currently using lessonStore directly)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _AppShellState {
  snapshot: LessonStoreSnapshot;
  swReadyMessage?: string;
  swUpdateHandler?: () => void;
}

type PanelId = 'sidebar' | 'player' | 'insights';

const STACKED_PANELS: Array<{ id: PanelId; label: string }> = [
  { id: 'sidebar', label: 'Каталог' },
  { id: 'player', label: 'Задание' },
  { id: 'insights', label: 'Подсказки' },
];

@customElement('app-shell')
export class AppShell extends LitElement {
  @state()
  declare snapshot: LessonStoreSnapshot;
  @state()
  declare swReadyMessage?: string;
  @state()
  declare swUpdateHandler?: () => void;
  private unsubscribe?: () => void;
  private offlineReadyHandler = () => {
    this.swReadyMessage = 'Приложение готово к офлайн-режиму';
  };
  @state()
  declare private isStackedLayout: boolean;
  @state()
  declare private isUltraNarrow: boolean;
  @state()
  declare private isCompactHeight: boolean;
  @state()
  declare private activePanel: PanelId;
  @state()
  declare private showConflictsPanel: boolean;
  @state()
  declare private answerPending: boolean;
  @state()
  declare private latestMessage?: string;
  private readonly hotkeysEnabled = isFeatureEnabled('hotkeys');
  private mediaSubscriptions: Array<{
    list: MediaQueryList;
    handler: (event: MediaQueryListEvent) => void;
  }> = [];

  constructor() {
    super();
    this.snapshot = lessonStore.snapshot;
    this.isStackedLayout = false;
    this.isUltraNarrow = false;
    this.isCompactHeight = false;
    this.activePanel = 'player';
    this.showConflictsPanel = false;
    this.answerPending = false;
    this.latestMessage = undefined;
  }

  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    .app-main {
      display: block;
      min-height: 100vh;
      position: relative;
    }

    .layout {
      display: grid;
      grid-template-columns:
        minmax(240px, var(--layout-sidebar))
        minmax(0, 1fr)
        minmax(260px, var(--layout-insights));
      align-items: start;
      gap: var(--layout-gap);
      padding: var(--layout-padding-y) var(--layout-padding-x);
      min-height: 100%;
    }

    .stacked-tabs {
      display: none;
      position: sticky;
      top: calc(var(--layout-padding-y) - 0.25rem);
      z-index: 2;
      background: var(--surface-1);
      border-radius: 999px;
      border: 1px solid #111b2a;
      padding: 0.35rem;
      gap: 0.25rem;
    }

    .stacked-tabs button {
      flex: 1;
      border: none;
      border-radius: 999px;
      padding: 0.45rem 0.75rem;
      background: transparent;
      color: var(--text-muted);
      font-weight: 600;
      cursor: pointer;
      transition:
        background 0.2s ease,
        color 0.2s ease;
    }

    .stacked-tabs button.active {
      background: var(--primary-soft);
      color: #fff;
    }

    .sidebar,
    .player-area,
    .insights {
      display: flex;
      flex-direction: column;
      gap: var(--panel-gap);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: var(--panel-padding);
      background: var(--surface-2);
      border-radius: var(--panel-radius);
      border: 1px solid #111b2a;
    }

    .form-error {
      color: var(--error);
      font-size: 0.9rem;
      margin: -0.25rem 0 0;
    }

    .hotkey-note {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin: 0.25rem 0;
    }

    .hotkey-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5rem;
      padding: 0.1rem 0.4rem;
      margin-left: 0.35rem;
      border-radius: 0.5rem;
      border: 1px solid #334155;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #02061755;
    }

    .conflict-placeholder {
      padding: var(--panel-padding);
      background: var(--surface-2);
      border-radius: var(--panel-radius);
      border: 1px dashed #334155;
    }

    .conflict-placeholder button {
      border: none;
      border-radius: 999px;
      padding: 0.45rem 1.2rem;
      margin-top: 0.5rem;
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }

    label {
      display: flex;
      flex-direction: column;
      font-size: 0.85rem;
      gap: 0.25rem;
    }

    input {
      border-radius: 0.75rem;
      border: 1px solid #1b2434;
      padding: 0.6rem 0.75rem;
      background: var(--surface-3);
      color: inherit;
    }

    form button[type='submit'] {
      align-self: flex-start;
      border-radius: 999px;
      padding: 0.5rem 1.5rem;
      background: var(--primary);
      color: #fff;
      border: none;
      font-weight: 600;
      cursor: pointer;
    }

    .sw-banner {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      background: var(--primary);
      color: #fff;
      padding: 0.75rem;
      display: flex;
      justify-content: center;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
      z-index: 5;
    }

    .sw-banner button {
      border: none;
      border-radius: 999px;
      background: #fff;
      color: #0b1521;
      padding: 0.4rem 1.25rem;
      cursor: pointer;
      font-weight: 600;
    }

    .onboarding {
      position: fixed;
      inset: 0;
      background: #020617cc;
      display: grid;
      place-items: center;
      backdrop-filter: blur(6px);
      z-index: 10;
    }

    .onboarding-card {
      background: var(--surface-1);
      padding: 2rem;
      border-radius: 1.5rem;
      max-width: 480px;
    }

    @media (max-width: 1439px) {
      .layout {
        grid-template-columns: minmax(240px, var(--layout-sidebar)) minmax(0, 1fr);
      }

      .insights {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 1023px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .stacked-tabs {
        display: flex;
        margin-bottom: 0.75rem;
      }
    }

    @media (max-width: 767px) {
      .sw-banner {
        flex-direction: column;
      }
    }

    @media (max-width: 479px) {
      .stacked-tabs button {
        font-size: 0.9rem;
        padding-inline: 0.5rem;
      }
    }

    :host([vh-compact]) .sw-banner {
      position: static;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = lessonStore.subscribe((snapshot) => {
      this.snapshot = snapshot;
      if (snapshot.notifications.length) {
        this.latestMessage = snapshot.notifications.at(-1)?.text ?? undefined;
        lessonStore.clearNotifications();
      }
    });
    window.addEventListener('sw-update-available', this.handleSwUpdate as EventListener);
    window.addEventListener('sw-offline-ready', this.offlineReadyHandler);
    if (this.hotkeysEnabled) {
      window.addEventListener('keydown', this.handleHotkeys);
    }
    this.setupMediaQueries();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    window.removeEventListener(
      'sw-update-available',
      this.handleSwUpdate as EventListener,
    );
    window.removeEventListener('sw-offline-ready', this.offlineReadyHandler);
    if (this.hotkeysEnabled) {
      window.removeEventListener('keydown', this.handleHotkeys);
    }
    this.teardownMediaQueries();
  }

  render() {
    return html`
      <main class="app-main" role="main" aria-labelledby="player-title">
        <div class="layout">
          ${this.renderStackedTabs()} ${this.renderSidebarSection()}
          ${this.renderPlayerSection()} ${this.renderInsightsSection()}
        </div>
        ${this.renderSwBanner()}${this.renderOnboarding()}
      </main>
    `;
  }

  private renderSidebarSection() {
    const hidden = this.isStackedLayout && this.activePanel !== 'sidebar';
    const ariaLabel = this.isStackedLayout ? 'tab-sidebar' : 'sidebar-title';
    return html`
      <aside
        class="sidebar"
        id="sidebar-panel"
        role=${this.isStackedLayout ? 'tabpanel' : 'complementary'}
        aria-labelledby=${ariaLabel}
        ?hidden=${hidden}
      >
        <h2 id="sidebar-title" class="sr-only">Каталог уроков и подключение</h2>
        <connection-indicator
          .online=${this.snapshot.connection.online}
          .queueSize=${this.snapshot.connection.queueSize}
          .syncing=${this.snapshot.connection.syncing}
          .message=${this.snapshot.connection.statusMessage}
          .conflicts=${this.snapshot.connection.conflicts}
          @sync-request=${this.handleSync}
        ></connection-indicator>
        <lesson-catalog
          .lessons=${this.snapshot.lessons}
          .activeLessonId=${this.snapshot.activeSession?.lessonId ?? ''}
          @lesson-selected=${this.handleLessonSelect}
        ></lesson-catalog>
      </aside>
    `;
  }

  private renderPlayerSection() {
    const hidden = this.isStackedLayout && this.activePanel !== 'player';
    const ariaLabel = this.isStackedLayout ? 'tab-player' : 'player-title';
    return html`
      <section
        class="player-area"
        id="player-panel"
        role=${this.isStackedLayout ? 'tabpanel' : 'region'}
        aria-labelledby=${ariaLabel}
        ?hidden=${hidden}
      >
        <h1 id="player-title" class="sr-only">Игровой плеер</h1>
        <lesson-player
          .session=${this.snapshot.activeSession}
          .timer=${this.snapshot.timer as TimerState}
          .scoreboard=${this.snapshot.scoreboard as ScoreState}
          .question=${this.getCurrentQuestion()}
          .progress=${this.snapshot.sessionProgress}
          .submitting=${this.answerPending}
          .notification=${this.latestMessage ?? ''}
          .hotkeysEnabled=${this.hotkeysEnabled}
          @answer-submit=${this.forwardAnswer}
          @answer-typing=${this.handleTyping}
          @show-catalog=${this.handleReturnToCatalog}
        ></lesson-player>
        <lesson-results
          .scoreboard=${this.snapshot.scoreboard}
          .lessonTitle=${this.snapshot.activeSession?.title ??
          this.snapshot.lastCompletedLessonTitle}
          .visible=${this.shouldShowResults()}
          @retry-lesson=${this.handleRetryLesson}
          @return-to-catalog=${this.handleReturnToCatalog}
          @next-level=${this.handleNextLevel}
        ></lesson-results>
      </section>
    `;
  }

  private renderInsightsSection() {
    const hidden = this.isStackedLayout && this.activePanel !== 'insights';
    const ariaLabel = this.isStackedLayout ? 'tab-insights' : 'insights-title';
    const availableHints = this.calculateHintAvailability();
    return html`
      <aside
        class="insights"
        id="insights-panel"
        role=${this.isStackedLayout ? 'tabpanel' : 'complementary'}
        aria-labelledby=${ariaLabel}
        ?hidden=${hidden}
      >
        <h2 id="insights-title" class="sr-only">Подсказки и объяснения</h2>
        <hint-panel
          .hints=${this.snapshot.hints.items}
          .explanations=${this.snapshot.hints.explanations}
          .loading=${this.snapshot.hints.isLoading}
          .error=${this.snapshot.hints.error}
          .hotkeysEnabled=${this.hotkeysEnabled}
          .availableHints=${availableHints}
          .maxHints=${MAX_HINTS_PER_SESSION}
          @request-hint=${this.forwardHint}
        ></hint-panel>
        ${this.renderConflictResolver()}
      </aside>
    `;
  }

  private calculateHintAvailability() {
    const hintsUsed = this.snapshot.scoreboard.hintsUsed;
    const serverRemaining = this.snapshot.scoreboard.hintsRemaining;
    const fallback = Math.max(0, MAX_HINTS_PER_SESSION - hintsUsed);
    if (typeof serverRemaining === 'number') {
      return Math.max(0, Math.min(serverRemaining, MAX_HINTS_PER_SESSION));
    }
    return fallback;
  }

  private renderConflictResolver() {
    const conflictCount = this.snapshot.conflicts.length;
    if (!conflictCount) {
      return null;
    }

    if (!this.showConflictsPanel) {
      return html`
        <section class="conflict-placeholder" aria-live="polite">
          <p>Нерешённых конфликтов: ${conflictCount}. Панель скрыта.</p>
          <button @click=${() => (this.showConflictsPanel = true)}>
            Открыть конфликты
          </button>
        </section>
      `;
    }

    return html`
      ${this.hotkeysEnabled
        ? html`<p class="hotkey-note" aria-hidden="true">
            Esc — скрыть панель конфликтов.
          </p>`
        : null}
      <conflict-resolver
        .conflicts=${this.snapshot.conflicts}
        @resolve-conflict=${this.handleConflictResolve}
        @clear-conflicts=${this.handleConflictClear}
      ></conflict-resolver>
    `;
  }

  private renderStackedTabs() {
    if (!this.isStackedLayout) {
      return null;
    }

    return html`
      <div
        class="stacked-tabs"
        role="tablist"
        aria-label="Разделы тренажёра"
        @keydown=${this.handleTabKeyDown}
      >
        ${STACKED_PANELS.map(({ id, label }) => {
          const active = this.activePanel === id;
          return html`
            <button
              id=${`tab-${id}`}
              class=${classMap({ active })}
              role="tab"
              aria-selected=${String(active)}
              aria-controls=${`${id}-panel`}
              tabindex=${active ? 0 : -1}
              @click=${() => this.setActivePanel(id)}
            >
              ${label}
            </button>
          `;
        })}
      </div>
    `;
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('isCompactHeight')) {
      this.toggleAttribute('vh-compact', this.isCompactHeight);
    }
  }

  private setActivePanel(panel: PanelId) {
    if (this.activePanel !== panel) {
      this.activePanel = panel;
    }
  }

  private handleTabKeyDown(event: KeyboardEvent) {
    if (!this.isStackedLayout) {
      return;
    }

    const { key } = event;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = STACKED_PANELS.findIndex(
      (panel) => panel.id === this.activePanel,
    );
    const lastIndex = STACKED_PANELS.length - 1;
    let nextIndex = currentIndex;

    if (key === 'ArrowRight') {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (key === 'ArrowLeft') {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = lastIndex;
    }

    const nextPanel = STACKED_PANELS[nextIndex].id;
    this.setActivePanel(nextPanel);
    const nextTab = this.renderRoot?.querySelector<HTMLButtonElement>(
      `#tab-${nextPanel}`,
    );
    nextTab?.focus();
  }

  private handleHotkeys = (event: KeyboardEvent) => {
    if (!this.hotkeysEnabled) {
      return;
    }

    const key = event.key.toLowerCase();
    const target = (event.composedPath?.()[0] ?? event.target) as HTMLElement | null;

    if (key === 'escape') {
      if (!this.snapshot.onboardingComplete) {
        event.preventDefault();
        lessonStore.setOnboardingComplete();
        return;
      }
      if (this.snapshot.conflicts.length && this.showConflictsPanel) {
        event.preventDefault();
        this.showConflictsPanel = false;
        return;
      }
    }

    if (this.isInputLikeTarget(target)) {
      return;
    }

    const isCtrlEnter = event.key === 'Enter' && event.ctrlKey;
    if (key === 'h') {
      event.preventDefault();
      this.forwardHint();
    } else if (key === 's' || isCtrlEnter) {
      event.preventDefault();
      // Отправка ответа обрабатывается в lesson-player через обработчик события
    }
  };

  private isInputLikeTarget(target: HTMLElement | null) {
    if (!target) {
      return false;
    }
    const tag = target.tagName?.toLowerCase();
    if (!tag) {
      return false;
    }
    if (tag === 'input' || tag === 'textarea') {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }
    return target.getAttribute('role') === 'textbox';
  }

  private setupMediaQueries() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    this.teardownMediaQueries();
    this.observeMedia('(max-width: 1023px)', (matches) => {
      this.isStackedLayout = matches;
      if (!matches) {
        this.activePanel = 'player';
      }
    });
    this.observeMedia('(max-width: 479px)', (matches) => {
      this.isUltraNarrow = matches;
    });
    this.observeMedia('(max-height: 599px)', (matches) => {
      this.isCompactHeight = matches;
    });
  }

  private observeMedia(query: string, setter: (matches: boolean) => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setter(false);
      return;
    }

    const list = window.matchMedia(query);
    setter(list.matches);
    const handler = (event: MediaQueryListEvent) => setter(event.matches);
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', handler);
    } else {
      list.addListener(handler);
    }
    this.mediaSubscriptions.push({ list, handler });
  }

  private teardownMediaQueries() {
    for (const { list, handler } of this.mediaSubscriptions) {
      if (typeof list.removeEventListener === 'function') {
        list.removeEventListener('change', handler);
      } else {
        list.removeListener(handler);
      }
    }
    this.mediaSubscriptions = [];
  }

  private renderSwBanner() {
    if (!this.swUpdateHandler) {
      return null;
    }
    return html`
      <div class="sw-banner">
        <span>Доступна новая версия приложения</span>
        <button @click=${() => this.swUpdateHandler?.()}>Обновить</button>
      </div>
    `;
  }

  private renderOnboarding() {
    if (this.snapshot.onboardingComplete) {
      return null;
    }
    return html`
      <div
        class="onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
      >
        <section
          class="onboarding-card"
          aria-labelledby="onboarding-title"
          aria-describedby="onboarding-desc"
        >
          <h2 id="onboarding-title">Добро пожаловать</h2>
          <p id="onboarding-desc">
            Выберите урок, чтобы начать занятие. Можно тренироваться офлайн — ответы
            синхронизируются при подключении к сети.
          </p>
          ${this.hotkeysEnabled
            ? html`<p class="hotkey-note">Esc — закрыть приветствие.</p>`
            : null}
          <button @click=${() => lessonStore.setOnboardingComplete()}>Понятно</button>
        </section>
      </div>
    `;
  }

  private handleLessonSelect = (event: CustomEvent<{ lessonId: string }>) => {
    lessonStore.startSession(event.detail.lessonId).catch((error) => {
      console.error(error);
    });
  };

  private forwardAnswer = async (event: CustomEvent<{ answer: string }>) => {
    if (this.answerPending) {
      return;
    }
    this.answerPending = true;
    try {
      await lessonStore.submitAnswer(event.detail.answer);
    } catch (error) {
      console.error(error);
    } finally {
      this.answerPending = false;
    }
  };

  private handleTyping = () => {
    lessonStore.trackKeypress();
  };

  private forwardHint = () => {
    lessonStore.requestHint();
  };

  private cachedQuestion?: Question;
  private cachedQuestionKey?: string;

  private getCurrentQuestion(): Question | undefined {
    const session = this.snapshot.activeSession;
    const text = session?.description?.trim();
    if (!session || !text) {
      this.cachedQuestion = undefined;
      this.cachedQuestionKey = undefined;
      return undefined;
    }
    const key = `${session.id}:${text}`;
    if (this.cachedQuestion && this.cachedQuestionKey === key) {
      return this.cachedQuestion;
    }
    this.cachedQuestion = {
      id: session.taskId ?? session.id,
      type: 'text',
      text,
    };
    this.cachedQuestionKey = key;
    return this.cachedQuestion;
  }

  private handleSync = () => {
    lessonStore.flushOfflineQueue();
  };

  private shouldShowResults() {
    const hasAttempts = this.snapshot.scoreboard.attempts > 0;
    const timerExpired = this.snapshot.timer.status === 'expired';
    const sessionInactive = !this.snapshot.activeSession;
    return hasAttempts && (timerExpired || sessionInactive);
  }

  private handleRetryLesson = () => {
    const lessonId =
      this.snapshot.activeSession?.lessonId ?? this.snapshot.lessons[0]?.id;
    if (lessonId) {
      lessonStore.startSession(lessonId);
      this.activePanel = 'player';
    }
  };

  private handleReturnToCatalog = () => {
    this.activePanel = 'sidebar';
    window.location.href = '/';
  };

  private handleNextLevel = async () => {
    const referenceId =
      this.snapshot.activeSession?.lessonId ?? this.snapshot.lastCompletedLessonId;
    const lessons = this.snapshot.lessons;
    if (!lessons.length) {
      window.location.href = '/';
      return;
    }
    const currentIndex = lessons.findIndex((lesson) => lesson.id === referenceId);
    let nextLesson =
      currentIndex >= 0
        ? lessons.slice(currentIndex + 1).find((lesson) => lesson.status !== 'locked')
        : undefined;
    if (!nextLesson) {
      nextLesson = lessons.find(
        (lesson) => lesson.status !== 'locked' && lesson.id !== referenceId,
      );
    }
    if (!nextLesson) {
      lessonStore.notify(
        'success',
        'Вы прошли все доступные уроки. Возвращаемся к темам.',
      );
      window.location.href = '/';
      return;
    }
    try {
      await lessonStore.startSession(nextLesson.id);
      this.activePanel = 'player';
    } catch (error) {
      console.error('Failed to start next lesson', error);
      lessonStore.notify(
        'error',
        'Не удалось открыть следующий урок. Возвращаемся к темам.',
      );
      window.location.href = '/';
    }
  };

  private handleSwUpdate = (event: CustomEvent<() => void>) => {
    this.swUpdateHandler = event.detail;
  };

  private handleConflictResolve = (
    event: CustomEvent<{ operationId: string; resolution: ConflictResolution }>,
  ) => {
    lessonStore.resolveConflict(event.detail.operationId, event.detail.resolution);
  };

  private handleConflictClear = () => {
    lessonStore.clearConflicts();
  };
}
