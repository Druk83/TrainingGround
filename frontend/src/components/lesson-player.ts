import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { LessonStoreSnapshot, TimerState, ScoreState } from '@/lib/session-store';
import './timer-display';
import './score-board';

type ActiveSession = LessonStoreSnapshot['activeSession'];

@customElement('lesson-player')
export class LessonPlayer extends LitElement {
  static properties = {
    session: { type: Object },
    timer: { type: Object },
    scoreboard: { type: Object },
    answer: { type: String },
    hotkeysEnabled: { type: Boolean },
  };

  declare session?: ActiveSession;
  declare timer?: TimerState;
  declare scoreboard?: ScoreState;
  declare answer: string;
  declare hotkeysEnabled: boolean;

  @state()
  declare private answerError?: string;

  constructor() {
    super();
    this.answer = '';
    this.hotkeysEnabled = false;
  }

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

    h1 {
      margin: 0 0 0.25rem;
      font-size: clamp(1.25rem, 1rem + 0.8vw, 1.75rem);
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

    const descriptionIds = ['answer-instructions'];
    if (this.answerError) {
      descriptionIds.push('answer-error');
    }

    return html`
      <div>
        <h1>${this.session.title}</h1>
        <p>${this.session.description}</p>
      </div>
      <timer-display .data=${this.timer}></timer-display>
      <score-board .data=${this.scoreboard}></score-board>
      <label>
        <span class="sr-only">Поле для ответа</span>
        <textarea
          .value=${this.answer}
          @input=${this.onInput}
          @keydown=${this.onKeyDown}
          aria-label="Ответ на задание"
          aria-describedby=${descriptionIds.join(' ')}
          aria-invalid=${this.answerError ? 'true' : 'false'}
        ></textarea>
      </label>
      <div class="field-meta" id="answer-instructions">
        ${this.hotkeysEnabled
          ? html`Горячие клавиши: Ctrl+Enter внутри поля, S (вне поля ввода).`
          : html`Введите развёрнутый ответ и нажмите «Отправить».`}
      </div>
      ${this.answerError
        ? html`<p class="field-error" id="answer-error" role="alert" aria-live="polite">
            ${this.answerError}
          </p>`
        : null}
      <button
        class="submit"
        @click=${this.handleSubmitClick}
        title=${this.hotkeysEnabled ? 'Ctrl+Enter или S (вне поля ввода)' : nothing}
      >
        Отправить ответ
        ${this.hotkeysEnabled
          ? html`<span class="hotkey-badge" aria-hidden="true">S</span>`
          : null}
      </button>
    `;
  }

  private onInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.answer = target.value;
    this.answerError = undefined;
    this.dispatchEvent(
      new CustomEvent('answer-typing', { bubbles: true, composed: true }),
    );
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      this.attemptSubmit();
    }
  }

  private handleSubmitClick = () => {
    this.attemptSubmit();
  };

  public submitAnswerFromHost() {
    this.attemptSubmit();
  }

  private attemptSubmit() {
    if (!this.answer.trim()) {
      this.answerError = 'Введите ответ перед отправкой.';
      return;
    }
    this.answerError = undefined;
    this.dispatchEvent(
      new CustomEvent('answer-submit', {
        detail: { answer: this.answer },
        bubbles: true,
        composed: true,
      }),
    );
    this.answer = '';
  }
}
