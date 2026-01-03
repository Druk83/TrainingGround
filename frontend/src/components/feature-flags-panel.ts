import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import type { FeatureFlagRecord } from '@/lib/api-types';
import { authService } from '@/lib/auth-service';

@customElement('feature-flags-panel')
export class FeatureFlagsPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    .panel {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }

    th,
    td {
      padding: 0.7rem 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    th {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.45rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      color: #fff;
      border-color: transparent;
    }

    .status {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .row-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  `;

  private readonly client = new ApiClient({
    jwt: authService.getToken() ?? undefined,
  });
  @state() declare private flags: FeatureFlagRecord[];
  @state() declare private loading: boolean;
  @state() declare private updatingFlag?: string;
  @state() declare private error?: string;

  constructor() {
    super();
    this.flags = [];
    this.loading = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadFlags();
  }

  render() {
    return html`
      <section class="panel">
        <div class="header">
          <h2>Feature Flags</h2>
          <p class="row-meta">Управление экспериментами и rollout.</p>
        </div>
        ${this.error ? html`<p class="row-meta">Ошибка: ${this.error}</p>` : null}
        <table>
          <thead>
            <tr>
              <th>Флаг</th>
              <th>Статус</th>
              <th>Rollout</th>
              <th>Целевые группы</th>
              <th>Последнее обновление</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${this.flags.map(
              (flag) => html`
                <tr>
                  <td>${flag.flag_name}</td>
                  <td class="status">${flag.enabled ? 'Включён' : 'Отключён'}</td>
                  <td>${flag.rollout_percentage ?? '—'}%</td>
                  <td>
                    ${flag.target_groups.length
                      ? flag.target_groups.join(', ')
                      : 'Все пользователи'}
                  </td>
                  <td>${new Date(flag.updated_at).toLocaleString('ru-RU')}</td>
                  <td>
                    <button
                      class="primary"
                      @click=${() => this.toggleFlag(flag)}
                      ?disabled=${this.updatingFlag === flag.flag_name}
                    >
                      ${flag.enabled ? 'Отключить' : 'Включить'}
                    </button>
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </section>
    `;
  }

  private async loadFlags() {
    this.loading = true;
    try {
      this.flags = await this.client.listFeatureFlags();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось загрузить флаги';
    } finally {
      this.loading = false;
    }
  }

  private async toggleFlag(flag: FeatureFlagRecord) {
    this.updatingFlag = flag.flag_name;
    this.error = undefined;
    try {
      await this.client.updateFeatureFlag(flag.flag_name, { enabled: !flag.enabled });
      await this.loadFlags();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось изменить флаг';
    } finally {
      this.updatingFlag = undefined;
    }
  }
}
