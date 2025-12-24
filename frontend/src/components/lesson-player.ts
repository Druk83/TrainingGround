import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
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
  };

  session?: ActiveSession;
  timer?: TimerState;
  scoreboard?: ScoreState;
  answer = '';

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
    }

    @media (max-width: 767px) {
      textarea {
        min-height: 130px;
        font-size: 0.95rem;
      }

      button.submit {
        width: 100%;
        text-align: center;
      }
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('session')) {
      this.answer = '';
    }
  }

  render() {
    if (!this.session) {
      return html`<p>Выберите урок в каталоге, чтобы начать занятие.</p>`;
    }

    return html`
      <div>
        <h1>${this.session.title}</h1>
        <p>${this.session.description}</p>
      </div>
      <timer-display .data=${this.timer}></timer-display>
      <score-board .data=${this.scoreboard}></score-board>
      <label>
        <span class="sr-only">Поле ответа</span>
        <textarea
          .value=${this.answer}
          @input=${this.onInput}
          @keydown=${this.onKeyDown}
          aria-label="Ответ на задание"
        ></textarea>
      </label>
      <button class="submit" @click=${this.handleSubmit}>Отправить ответ</button>
    `;
  }

  private onInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.answer = target.value;
    this.dispatchEvent(
      new CustomEvent('answer-typing', { bubbles: true, composed: true }),
    );
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      this.handleSubmit();
    }
  }

  private handleSubmit() {
    if (!this.answer.trim()) {
      return;
    }
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
