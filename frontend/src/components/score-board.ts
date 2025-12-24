import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { ScoreState } from '@/lib/session-store';

@customElement('score-board')
export class ScoreBoard extends LitElement {
  static properties = {
    data: { type: Object },
  };

  data: ScoreState = {
    totalScore: 0,
    attempts: 0,
    correct: 0,
    accuracy: 0,
    currentStreak: 0,
    longestStreak: 0,
    hintsUsed: 0,
  };

  static styles = css`
    :host {
      display: block;
      background: var(--surface-2);
      padding: var(--panel-padding);
      border-radius: var(--panel-radius);
    }

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.75rem;
    }

    .card {
      background: var(--surface-3);
      padding: 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid #1c2539;
    }

    .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .value {
      font-size: 1.4rem;
      font-weight: 600;
    }
  `;

  render() {
    const stats = [
      { label: 'Баллы', value: this.data.totalScore },
      { label: 'Точность', value: `${this.data.accuracy}%` },
      { label: 'Попытки', value: `${this.data.correct}/${this.data.attempts}` },
      { label: 'Серия', value: this.data.currentStreak },
      { label: 'Рекорд', value: this.data.longestStreak },
      {
        label: 'Подсказки',
        value: `${this.data.hintsUsed}${
          this.data.hintsRemaining !== undefined ? ` / ${this.data.hintsRemaining}` : ''
        }`,
      },
    ];

    return html`
      <section aria-labelledby="score-heading">
        <h2 id="score-heading">Статистика</h2>
        <div class="grid">
          ${stats.map(
            (stat) => html`
              <div class="card">
                <div class="label">${stat.label}</div>
                <div class="value">${stat.value}</div>
              </div>
            `,
          )}
        </div>
      </section>
    `;
  }
}
