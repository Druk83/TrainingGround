import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { TimerState } from '@/lib/session-store';

const LOW_TIME_THRESHOLD = 10;

@customElement('timer-display')
export class TimerDisplay extends LitElement {
  static properties = {
    data: { attribute: false },
  };

  private _data: TimerState = {
    status: 'idle',
    remainingSeconds: 0,
    totalSeconds: 0,
  };

  get data() {
    return this._data;
  }

  set data(value: TimerState) {
    const oldValue = this._data;
    this._data = value;
    this.requestUpdate('data', oldValue);
  }

  static styles = css`
    :host {
      display: block;
      background: var(--surface-3);
      padding: 1rem;
      border-radius: 1rem;
      border: 1px solid #1f2937;
    }

    .time {
      font-size: clamp(2rem, 6vw, 3rem);
      font-weight: 600;
      color: var(--text-main);
    }

    .bar {
      width: 100%;
      height: 0.5rem;
      border-radius: 999px;
      background: #111827;
      overflow: hidden;
      margin-top: 0.5rem;
    }

    .bar div {
      height: 100%;
      background: var(--primary);
    }

    .time.urgent {
      color: var(--error);
    }

    .bar.urgent div {
      background: var(--error);
    }
  `;

  render() {
    const percent = this.data.totalSeconds
      ? Math.max(
          0,
          Math.min((this.data.remainingSeconds / this.data.totalSeconds) * 100, 100),
        )
      : 0;
    const isUrgent =
      this.data.status === 'running' && this.data.remainingSeconds <= LOW_TIME_THRESHOLD;
    return html`
      <div class=${`time${isUrgent ? ' urgent' : ''}`} aria-live="assertive">
        ${this.formatTime(this.data.remainingSeconds)}
      </div>
      <div
        class=${`bar${isUrgent ? ' urgent' : ''}`}
        role="progressbar"
        aria-label="Оставшееся время"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${percent}
      >
        <div style="width: ${percent}%;"></div>
      </div>
      <p>${this.data.status === 'expired' ? 'Время истекло' : 'Таймер активен'}</p>
    `;
  }

  private formatTime(value: number) {
    const minutes = Math.floor(value / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
