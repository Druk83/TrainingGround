import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import {
  lessonStore,
  type LessonStoreSnapshot,
  type ScoreState,
  type TimerState,
  type ConflictResolution,
  MAX_HINTS_PER_SESSION,
} from '@/lib/session-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import '@/components/lesson-catalog';
import '@/components/lesson-player';
import '@/components/lesson-results';
import '@/components/hint-panel';
import '@/components/connection-indicator';
import '@/components/conflict-resolver';
import type { LessonPlayer } from '@/components/lesson-player';

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
  snapshot: LessonStoreSnapshot = lessonStore.snapshot;
  @state()
  swReadyMessage?: string;
  @state()
  swUpdateHandler?: () => void;
  private unsubscribe?: () => void;
  private offlineReadyHandler = () => {
    this.swReadyMessage = 'Приложение готово к офлайн-режиму';
  };
  @state()
  private isStackedLayout = false;
  @state()
  private isUltraNarrow = false;
  @state()
  private isCompactHeight = false;
  @state()
  private activePanel: PanelId = 'player';
  @state()
  private userFormError?: string;
  @state()
  private showConflictsPanel = true;
  private readonly hotkeysEnabled = isFeatureEnabled('hotkeys');
  private mediaSubscriptions: Array<{
    list: MediaQueryList;
    handler: (event: MediaQueryListEvent) => void;
  }> = [];

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

    details.user-form {
      border-radius: var(--panel-radius);
      border: 1px solid #111b2a;
      background: var(--surface-2);
    }

    details.user-form summary {
      list-style: none;
      cursor: pointer;
      padding: 0.65rem var(--panel-padding);
      font-weight: 600;
    }

    details.user-form summary::-webkit-details-marker {
      display: none;
    }

    details.user-form[open] summary {
      border-bottom: 1px solid #111b2a;
    }

    details.user-form form {
      background: transparent;
      border: none;
      margin: 0;
      border-radius: 0 0 var(--panel-radius) var(--panel-radius);
      padding: var(--panel-padding);
      padding-top: 0;
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

    .toast {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      background: var(--surface-3);
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      border: 1px solid #1f2937;
      box-shadow: 0 10px 30px #0006;
      max-width: min(320px, 90vw);
      z-index: 6;
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

      .toast {
        right: 0.75rem;
        left: 0.75rem;
        bottom: 0.75rem;
      }
    }

    @media (max-width: 767px) {
      form {
        padding: calc(var(--panel-padding) - 0.25rem);
      }

      .sw-banner {
        flex-direction: column;
      }
    }

    @media (max-width: 479px) {
      .stacked-tabs button {
        font-size: 0.9rem;
        padding-inline: 0.5rem;
      }

      button[type='submit'] {
        width: 100%;
        text-align: center;
      }

      .toast {
        right: 0.5rem;
        left: 0.5rem;
      }
    }

    :host([vh-compact]) .toast {
      bottom: 0.25rem;
    }

    :host([vh-compact]) .sw-banner {
      position: static;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = lessonStore.subscribe((snapshot) => {
      this.snapshot = snapshot;
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
        ${this.renderNotifications()}${this.renderSwBanner()}${this.renderOnboarding()}
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
        ${this.renderUserForm()}
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
          .hotkeysEnabled=${this.hotkeysEnabled}
          @answer-submit=${this.forwardAnswer}
          @answer-typing=${this.handleTyping}
        ></lesson-player>
        <lesson-results
          .scoreboard=${this.snapshot.scoreboard}
          .lessonTitle=${this.snapshot.activeSession?.title}
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
      return html`
        <conflict-resolver
          .conflicts=${this.snapshot.conflicts}
          @resolve-conflict=${this.handleConflictResolve}
          @clear-conflicts=${this.handleConflictClear}
        ></conflict-resolver>
      `;
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
    if (
      changed.has('snapshot') &&
      !this.snapshot.conflicts.length &&
      !this.showConflictsPanel
    ) {
      this.showConflictsPanel = true;
    }
  }

  private renderUserForm() {
    const errorId = 'user-form-error';
    const formTemplate = html`
      <form @submit=${this.handleUserSubmit} aria-describedby=${errorId} novalidate>
        <label>
          ID ученика
          <input
            name="userId"
            .value=${this.snapshot.user.id ?? ''}
            required
            aria-describedby=${errorId}
            aria-invalid=${this.userFormError ? 'true' : 'false'}
          />
        </label>
        <label>
          ID группы
          <input name="groupId" .value=${this.snapshot.user.groupId ?? ''} />
        </label>
        <label>
          JWT (необязательно)
          <input name="token" .value=${this.snapshot.user.token ?? ''} />
        </label>
        <button type="submit">Сохранить</button>
        <p id=${errorId} class="form-error" role="alert" aria-live="polite">
          ${this.userFormError ?? ''}
        </p>
      </form>
    `;

    if (!this.isUltraNarrow) {
      return formTemplate;
    }

    return html`
      <details class="user-form">
        <summary>Профиль доступа</summary>
        ${formTemplate}
      </details>
    `;
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
      this.submitAnswerFromHotkey();
    }
  };

  private submitAnswerFromHotkey() {
    if (!this.snapshot.activeSession) {
      return;
    }
    const player = this.renderRoot?.querySelector<LessonPlayer>('lesson-player');
    player?.submitAnswerFromHost();
  }

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

  private renderNotifications() {
    if (!this.snapshot.notifications.length && !this.swReadyMessage) {
      return null;
    }
    return html`
      <div class="toast" aria-live="polite">
        ${this.snapshot.notifications.map((note) => html`<p>${note.text}</p>`)}
        ${this.swReadyMessage ? html`<p>${this.swReadyMessage}</p>` : null}
      </div>
    `;
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

  private forwardAnswer = (event: CustomEvent<{ answer: string }>) => {
    lessonStore.submitAnswer(event.detail.answer);
  };

  private handleTyping = () => {
    lessonStore.trackKeypress();
  };

  private forwardHint = () => {
    lessonStore.requestHint();
  };

  private handleSync = () => {
    lessonStore.flushOfflineQueue();
  };

  private shouldShowResults() {
    return (
      this.snapshot.timer.status === 'expired' &&
      this.snapshot.scoreboard.attempts > 0 &&
      Boolean(this.snapshot.activeSession)
    );
  }

  private handleRetryLesson = () => {
    const lessonId = this.snapshot.activeSession?.taskId ?? this.snapshot.lessons[0]?.id;
    if (lessonId) {
      lessonStore.startSession(lessonId);
      this.activePanel = 'player';
    }
  };

  private handleReturnToCatalog = () => {
    this.activePanel = 'sidebar';
  };

  private handleNextLevel = () => {
    const currentId = this.snapshot.activeSession?.taskId;
    const lessons = this.snapshot.lessons;
    const currentIndex = lessons.findIndex((lesson) => lesson.id === currentId);
    const nextLesson = lessons
      .slice(currentIndex + 1)
      .find((lesson) => lesson.status !== 'locked');
    const lessonToStart = nextLesson ?? lessons[0];
    if (lessonToStart) {
      lessonStore.startSession(lessonToStart.id);
      this.activePanel = 'player';
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

  private handleUserSubmit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const userId = String(data.get('userId') ?? '').trim();
    const groupId = String(data.get('groupId') ?? '').trim();
    const token = String(data.get('token') ?? '').trim();

    if (!userId) {
      this.userFormError = 'Укажите ID ученика перед сохранением.';
      form.querySelector<HTMLInputElement>("input[name='userId']")?.focus();
      return;
    }

    this.userFormError = undefined;
    lessonStore.setUser({
      id: userId,
      groupId,
      token,
    });
  }
}
