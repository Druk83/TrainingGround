import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { ScoreState } from '@/lib/session-store';

@customElement('score-board')
export class ScoreBoard extends LitElement {
  static properties = {
    data: { type: Object },
  };

  declare data: ScoreState;
  declare private announceText: string;

  constructor() {
    super();
    this.data = {
      totalScore: 0,
      attempts: 0,
      correct: 0,
      accuracy: 0,
      currentStreak: 0,
      longestStreak: 0,
      hintsUsed: 0,
    };
    this.announceText = this.composeAnnouncement(this.data);
  }

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

    .delta {
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-muted);
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
      <section aria-labelledby="score-heading" role="status">
        <div class="sr-only" aria-live="polite" aria-atomic="true">
          ${this.announceText}
        </div>
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
      ${this.renderDeltaBanner()}
    `;
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has('data')) {
      this.announceText = this.composeAnnouncement(
        this.data,
        changed.get('data') as ScoreState,
      );
    }
  }

  private composeAnnouncement(current: ScoreState, previous?: ScoreState): string {
    if (
      previous &&
      previous.totalScore === current.totalScore &&
      previous.currentStreak === current.currentStreak
    ) {
      return this.announceText;
    }

    const parts = [`Баллы: ${current.totalScore}`];
    parts.push(
      current.currentStreak > 0
        ? `Текущая серия: ${current.currentStreak}`
        : 'Серия обнулена',
    );
    return parts.join('. ');
  }

  private renderDeltaBanner() {
    const message = this.composeDeltaMessage(this.data);
    if (!message) {
      return null;
    }
    return html`<p class="delta" aria-live="polite">${message}</p>`;
  }

  private composeDeltaMessage(data: ScoreState): string | null {
    if (typeof data.lastHintPenalty === 'number' && data.lastHintPenalty < 0) {
      return `Штраф за подсказку ${data.lastHintPenalty}`;
    }
    if (typeof data.lastScoreDelta === 'number' && data.lastScoreDelta > 0) {
      const bonus = data.lastBonusApplied ? ' (бонус за серию)' : '';
      return `+${data.lastScoreDelta} баллов${bonus}`;
    }
    if (typeof data.lastScoreDelta === 'number' && data.lastScoreDelta === 0) {
      return 'Последний ответ не принёс баллов';
    }
    return null;
  }
}
