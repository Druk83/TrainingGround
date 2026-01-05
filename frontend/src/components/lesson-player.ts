import type {
  LessonStoreSnapshot,
  ScoreState,
  SessionProgress,
  TimerState,
} from '@/lib/session-store';
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './question-renderer';
import type { Question } from './question-renderer';
import './score-board';
import './timer-display';

type ActiveSession = LessonStoreSnapshot['activeSession'];

@customElement('lesson-player')
export class LessonPlayer extends LitElement {
  static properties = {
    session: { type: Object },
    timer: { type: Object },
    scoreboard: { type: Object },
    question: { type: Object },
    answer: { type: String },
    hotkeysEnabled: { type: Boolean },
    submitting: { type: Boolean },
    notification: { type: String },
    progress: { type: Object },
  };

  declare session?: ActiveSession;
  declare timer?: TimerState;
  declare scoreboard?: ScoreState;
  declare question?: Question;
  declare answer: string;
  declare hotkeysEnabled: boolean;
  declare submitting: boolean;
  declare notification?: string;
  declare progress?: SessionProgress;

  @state()
  declare private answerError?: string;

  private questionRendererRef?: HTMLElement;

  constructor() {
    super();
    this.answer = '';
    this.hotkeysEnabled = false;
    this.submitting = false;
    this.notification = undefined;
    this.setupDocumentListeners();
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleDocumentKeydown);
  }

  private setupDocumentListeners() {
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
  }

  private handleDocumentKeydown = (event: KeyboardEvent) => {
    if (!this.hotkeysEnabled) return;

    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent('request-hint', { bubbles: true, composed: true }),
      );
    } else if (event.key === 's' || event.key === 'S') {
      const isInTextarea = (event.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (!isInTextarea) {
        event.preventDefault();
        const renderer = this.querySelector('question-renderer') as HTMLElement & {
          getAnswer?: () => string | undefined;
        };
        if (renderer) {
          renderer.dispatchEvent(
            new CustomEvent('answer-submit', {
              detail: { answer: renderer.getAnswer?.() },
              bubbles: true,
              composed: true,
            }),
          );
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent('close-modal', { bubbles: true, composed: true }),
      );
    }
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      background: var(--surface-1);
      padding: var(--panel-padding);
      border-radius: var(--panel-radius);
      border: 1px solid #111b2a;
    }

    .player-header {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: flex-start;
    }

    h1 {
      margin: 0 0 0.25rem;
      font-size: clamp(1.25rem, 1rem + 0.8vw, 1.65rem);
    }

    .subtitle {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    textarea {
      width: 100%;
      min-height: 160px;
      background: var(--surface-3);
      color: inherit;
      border: 1px solid #1f2937;
      border-radius: 1rem;
      padding: 1rem;
      font-size: 1rem;
      resize: vertical;
    }

    button.submit {
      margin-top: 0.75rem;
      padding: 0.8rem 1.5rem;
      border-radius: 999px;
      border: none;
      background: var(--primary);
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
    }

    .field-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0.25rem 0 0;
    }

    .field-error {
      color: var(--error);
      font-size: 0.85rem;
      margin: 0.4rem 0 0;
    }

    .step {
      margin: 0;
      font-size: 0.9rem;
      color: var(--text-muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .feedback {
      margin: 0;
      padding: 0.5rem 0.75rem;
      background: var(--surface-3);
      border-radius: 0.65rem;
      font-size: 0.9rem;
    }

    .ghost-button {
      border: 1px solid #1f2937;
      background: transparent;
      color: var(--text-muted);
      border-radius: 999px;
      padding: 0.4rem 0.9rem;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.2s ease;
    }

    .ghost-button:hover,
    .ghost-button:focus-visible {
      border-color: var(--primary);
      color: #fff;
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

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 767px) {
      .player-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .ghost-button {
        width: 100%;
        text-align: center;
      }

      textarea {
        min-height: 130px;
        font-size: 0.95rem;
      }

      button.submit {
        width: 100%;
        text-align: center;
        justify-content: center;
      }
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('session')) {
      this.answer = '';
      this.answerError = undefined;
    }
  }

  render() {
    if (!this.session) {
      return html`<p>Выберите урок в каталоге, чтобы начать тренировку.</p>`;
    }

    const stepLabel = this.composeStepLabel();
    return html`
      <div class="player-header">
        <div>
          <p class="step">${stepLabel}</p>
          <h1>${this.session.title}</h1>
        </div>
        <button class="ghost-button" @click=${this.onShowCatalog}>Каталог курсов</button>
      </div>
      <timer-display .data=${this.timer}></timer-display>
      <score-board .data=${this.scoreboard} .progress=${this.progress}></score-board>
      ${this.notification
        ? html`<p class="feedback" role="status" aria-live="polite">
            ${this.notification}
          </p>`
        : null}
      ${this.question
        ? html`
            <question-renderer
              .question=${this.question}
              .answer=${this.answer}
              .submitDisabled=${this.submitting}
              .hotkeysEnabled=${this.hotkeysEnabled}
              @answer-submit=${this.onAnswerSubmit}
              @answer-error=${this.onAnswerError}
              @answer-typing=${this.onAnswerTyping}
            ></question-renderer>
          `
        : html`<p>Загрузка задания...</p>`}
      ${this.answerError
        ? html`<p class="field-error" role="alert" aria-live="polite">
            ${this.answerError}
          </p>`
        : null}
    `;
  }

  private onAnswerSubmit = (event: CustomEvent) => {
    this.answerError = undefined;
    this.dispatchEvent(
      new CustomEvent('answer-submit', {
        detail: event.detail,
        bubbles: true,
        composed: true,
      }),
    );
  };

  private onAnswerError = (event: CustomEvent) => {
    this.answerError = event.detail.message;
  };

  private onAnswerTyping = (_event: CustomEvent) => {
    this.dispatchEvent(
      new CustomEvent('answer-typing', {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private composeStepLabel() {
    const total = this.progress?.totalSteps ?? 0;
    const current = this.progress?.currentStep ?? 1;
    if (total > 0) {
      return `Задание ${Math.min(current, total)} из ${total}`;
    }
    return `Задание ${Math.max(current, 1)}`;
  }

  private onShowCatalog = () => {
    this.dispatchEvent(
      new CustomEvent('show-catalog', {
        bubbles: true,
        composed: true,
      }),
    );
  };
}
