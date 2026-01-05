import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ScoreState } from '@/lib/session-store';

@customElement('lesson-results')
export class LessonResults extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--surface-2);
      padding: 1.5rem;
      border-radius: var(--panel-radius);
      border: 1px solid #1f2937;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    }

    .status {
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0;
    }

    .card {
      background: var(--surface-3);
      padding: 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid #111b2a;
      text-align: center;
    }

    .card span {
      display: block;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .value {
      font-size: 1.5rem;
      font-weight: 600;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    button {
      flex: 1;
      border: none;
      border-radius: 999px;
      padding: 0.75rem 1.25rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      background: var(--primary);
      color: #fff;
    }

    button.secondary {
      background: transparent;
      border: 1px solid var(--primary);
      color: var(--primary);
    }
  `;

  @property({ type: Object })
  declare scoreboard?: ScoreState;

  @property({ type: String })
  declare lessonTitle?: string;

  @property({ type: Boolean })
  declare visible: boolean;

  constructor() {
    super();
    this.visible = false;
  }

  render() {
    if (!this.visible || !this.scoreboard) {
      return html``;
    }

    const passed = this.scoreboard.accuracy >= 80;
    const status = passed ? 'Уровень пройден' : 'Требуется 80%';
    return html`
      <div>
        <p class="status">${status}</p>
        <h2>${this.lessonTitle ?? 'Результаты урока'}</h2>
        <div class="grid">
          <div class="card">
            <div class="value">${this.scoreboard.totalScore}</div>
            <span>Итоговые баллы</span>
          </div>
          <div class="card">
            <div class="value">${this.scoreboard.accuracy}%</div>
            <span>Точность</span>
          </div>
          <div class="card">
            <div class="value">${this.scoreboard.currentStreak}</div>
            <span>Серия</span>
          </div>
          <div class="card">
            <div class="value">${this.scoreboard.hintsUsed}</div>
            <span>Подсказки</span>
          </div>
        </div>
        <div class="actions">
          <button @click=${passed ? this.handleNextLevel : this.handleRetry}>
            ${passed ? 'Следующий уровень' : 'Повторить уровень'}
          </button>
          <button class="secondary" @click=${this.handleBack}>Вернуться к темам</button>
        </div>
      </div>
    `;
  }

  private handleRetry() {
    this.dispatchEvent(
      new CustomEvent('retry-lesson', { bubbles: true, composed: true }),
    );
  }

  private handleNextLevel() {
    this.dispatchEvent(new CustomEvent('next-level', { bubbles: true, composed: true }));
  }

  private handleBack() {
    this.dispatchEvent(
      new CustomEvent('return-to-catalog', { bubbles: true, composed: true }),
    );
  }
}
