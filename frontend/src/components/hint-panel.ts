import { LitElement, html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { HintEntry, ExplanationEntry } from '@/lib/session-store';

@customElement('hint-panel')
export class HintPanel extends LitElement {
  static properties = {
    hints: { type: Array },
    explanations: { type: Array },
    loading: { type: Boolean },
    error: { type: String },
    hotkeysEnabled: { type: Boolean },
  };

  declare hints: HintEntry[];
  declare explanations: ExplanationEntry[];
  declare loading: boolean;
  declare error?: string;
  declare hotkeysEnabled: boolean;

  constructor() {
    super();
    this.hints = [];
    this.explanations = [];
    this.loading = false;
    this.error = undefined;
    this.hotkeysEnabled = false;
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--panel-padding);
      background: var(--surface-2);
      border-radius: var(--panel-radius);
      border: 1px solid #1b2434;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    h2 {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    button {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.6rem 1rem;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 600;
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

    button[disabled] {
      opacity: 1;
      cursor: wait;
      background: #1e3a8a;
      color: #cbd5f5;
    }

    article {
      background: var(--surface-3);
      padding: 0.75rem;
      border-radius: 0.75rem;
      margin-top: 0.5rem;
    }

    .source {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .empty {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin: 0.5rem 0;
    }
  `;

  render() {
    return html`
      <section aria-labelledby="hints-heading">
        <div class="header">
          <h2 id="hints-heading">Подсказки</h2>
          <button
            @click=${this.handleHintRequest}
            ?disabled=${this.loading}
            aria-busy=${this.loading}
            title=${this.hotkeysEnabled ? 'Горячая клавиша: H' : nothing}
          >
            ${this.loading ? 'Отправляем...' : 'Запросить подсказку'}
            ${this.hotkeysEnabled && !this.loading
              ? html`<span class="hotkey-badge" aria-hidden="true">H</span>`
              : null}
          </button>
        </div>
        ${this.error ? html`<p role="alert">${this.error}</p>` : null}
        <div aria-live="polite">
          ${this.hints.length === 0
            ? html`<p class="empty">Подсказки ещё не получены.</p>`
            : this.hints.map(
                (hint) => html`
                  <article>
                    <p>${hint.text}</p>
                    <div class="source">
                      Стоимость: ${hint.cost} баллов •
                      ${new Date(hint.timestamp).toLocaleTimeString()}
                    </div>
                  </article>
                `,
              )}
        </div>
        <h2 style="margin-top:1rem;">Объяснения</h2>
        ${this.explanations.length === 0
          ? html`<p class="empty">Объяснения появятся после проверки.</p>`
          : this.explanations.map(
              (explanation) => html`
                <article>
                  <p>${explanation.text}</p>
                  <div class="source">
                    Источник: ${explanation.source} • Правила:
                    ${explanation.ruleRefs.join(', ')}
                  </div>
                </article>
              `,
            )}
      </section>
    `;
  }

  private handleHintRequest() {
    this.dispatchEvent(
      new CustomEvent('request-hint', { bubbles: true, composed: true }),
    );
  }
}
