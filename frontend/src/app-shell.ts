import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import {
  lessonStore,
  type LessonStoreSnapshot,
  type ScoreState,
  type TimerState,
  type ConflictResolution,
} from '@/lib/session-store';
import '@/components/lesson-catalog';
import '@/components/lesson-player';
import '@/components/hint-panel';
import '@/components/connection-indicator';
import '@/components/conflict-resolver';

interface AppShellState {
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
  static properties = {
    snapshot: { type: Object },
    swReadyMessage: { type: String },
    swUpdateHandler: { type: Function },
  } satisfies Record<keyof AppShellState, unknown>;

  snapshot: LessonStoreSnapshot = lessonStore.snapshot;
  swReadyMessage?: string;
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
  private mediaSubscriptions: Array<{
    list: MediaQueryList;
    handler: (event: MediaQueryListEvent) => void;
  }> = [];

  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
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

    .onboarding article {
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
    this.teardownMediaQueries();
  }

  render() {
    return html`
      <div class="layout">
        ${this.renderStackedTabs()} ${this.renderSidebarSection()}
        ${this.renderPlayerSection()} ${this.renderInsightsSection()}
      </div>
      ${this.renderNotifications()}${this.renderSwBanner()}${this.renderOnboarding()}
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
        role=${this.isStackedLayout ? 'tabpanel' : 'main'}
        aria-labelledby=${ariaLabel}
        ?hidden=${hidden}
      >
        <h2 id="player-title" class="sr-only">Игровой плеер</h2>
        <lesson-player
          .session=${this.snapshot.activeSession}
          .timer=${this.snapshot.timer as TimerState}
          .scoreboard=${this.snapshot.scoreboard as ScoreState}
          @answer-submit=${this.forwardAnswer}
          @answer-typing=${this.handleTyping}
        ></lesson-player>
      </section>
    `;
  }

  private renderInsightsSection() {
    const hidden = this.isStackedLayout && this.activePanel !== 'insights';
    const ariaLabel = this.isStackedLayout ? 'tab-insights' : 'insights-title';
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
          @request-hint=${this.forwardHint}
        ></hint-panel>
        <conflict-resolver
          .conflicts=${this.snapshot.conflicts}
          @resolve-conflict=${this.handleConflictResolve}
          @clear-conflicts=${this.handleConflictClear}
        ></conflict-resolver>
      </aside>
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

  private renderUserForm() {
    const formTemplate = html`
      <form @submit=${this.handleUserSubmit}>
        <label>
          ID ученика
          <input name="userId" .value=${this.snapshot.user.id ?? ''} required />
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
      <div class="onboarding">
        <article>
          <h2>Добро пожаловать</h2>
          <p>
            Выберите урок, чтобы начать занятие. Можно тренироваться офлайн — ответы
            синхронизируются при подключении к сети.
          </p>
          <button @click=${() => lessonStore.setOnboardingComplete()}>Понятно</button>
        </article>
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
    lessonStore.setUser({
      id: String(data.get('userId') ?? ''),
      groupId: String(data.get('groupId') ?? ''),
      token: String(data.get('token') ?? ''),
    });
  }
}
