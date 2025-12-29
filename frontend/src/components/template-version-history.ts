import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface TemplateVersionHistoryEntry {
  version: number;
  updatedAt?: string;
  author?: string;
  changes?: Record<string, unknown>;
}

@customElement('template-version-history')
export class TemplateVersionHistory extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }

    .dialog {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      width: min(560px, 100%);
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    header h3 {
      margin: 0;
    }

    header button {
      border: none;
      background: transparent;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      color: var(--text-main);
    }

    .versions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .row-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .version {
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-large);
      padding: 0.9rem 1rem;
      background: var(--surface-3);
    }

    .version-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .version-row strong {
      font-size: 1rem;
    }

    .changes {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .version button {
      margin-top: 0.5rem;
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: transparent;
      padding: 0.4rem 0.9rem;
      text-transform: none;
    }
    .changes-list {
      list-style: none;
      margin: 0.5rem 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .change-item {
      padding: 0.6rem;
      border-radius: var(--radius-medium);
      background: var(--surface-3);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .change-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .change-value {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
      color: var(--text-main);
      white-space: pre-wrap;
    }

    .changes-empty {
      color: var(--text-muted);
      font-size: 0.85rem;
    }
  `;

  @property({ type: Array })
  entries: TemplateVersionHistoryEntry[] = [];

  @property({ type: Boolean })
  open = false;

  render() {
    if (!this.open) {
      return html``;
    }
    return html`
      <div
        class="overlay"
        role="button"
        tabindex="0"
        @click=${this.handleClose}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleClose();
          }
        }}
      >
        <div
          class="dialog"
          @click=${this.stopPropagation}
          role="document"
          @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
        >
          <header>
            <h3>История версий</h3>
            <button type="button" @click=${this.handleClose} aria-label="Закрыть">
              ×
            </button>
          </header>
          <div class="versions">
            ${this.entries.length === 0
              ? html`<p>Версии пока не сохранены.</p>`
              : this.entries.map(
                  (entry) => html`
                    <div
                      class="version"
                      role="button"
                      tabindex="0"
                      @click=${() => this.handleRestore(entry.version)}
                      @keydown=${(event: KeyboardEvent) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          this.handleRestore(entry.version);
                        }
                      }}
                    >
                      <div class="version-row">
                        <strong>Версия ${entry.version}</strong>
                        <span class="row-meta">
                          ${entry.updatedAt
                            ? new Date(entry.updatedAt).toLocaleString('ru-RU')
                            : '—'}
                          ${entry.author ? `• ${entry.author}` : ''}
                        </span>
                      </div>
                      ${this.renderChanges(entry.changes)}
                      <button
                        type="button"
                        @click=${() => this.handleRestore(entry.version)}
                      >
                        Восстановить версию
                      </button>
                    </div>
                  `,
                )}
          </div>
        </div>
      </div>
    `;
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private handleRestore(version: number) {
    this.dispatchEvent(
      new CustomEvent('restore-version', {
        detail: { version },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private stopPropagation(event: Event) {
    event.stopPropagation();
  }

  private renderChanges(changes?: Record<string, unknown>) {
    if (!changes || Object.keys(changes).length === 0) {
      return html`<p class="changes-empty">Изменения недоступны.</p>`;
    }
    return html`
      <ul class="changes-list">
        ${Object.entries(changes).map(
          ([key, value]) => html`
            <li class="change-item">
              <span class="change-label">${key}</span>
              <span class="change-value">${this.renderChangeValue(value)}</span>
            </li>
          `,
        )}
      </ul>
    `;
  }

  private renderChangeValue(value: unknown) {
    if (value === undefined || value === null) {
      return '—';
    }
    if (typeof value === 'object') {
      return html`<pre>${JSON.stringify(value, null, 2)}</pre>`;
    }
    return String(value);
  }
}
