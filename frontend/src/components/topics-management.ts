import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { ApiClient } from '@/lib/api-client';
import { authService } from '@/lib/auth-service';
import type {
  LevelCreatePayload,
  LevelSummary,
  TopicCreatePayload,
  TopicSummary,
} from '@/lib/api-types';

type LevelDraft = {
  name: string;
  difficulty: LevelSummary['difficulty'];
  min_pass_percent: number;
};

@customElement('topics-management')
export class TopicsManagement extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    section {
      background: var(--surface-2);
      border-radius: var(--radius-large);
      padding: 1.5rem;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .topic-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .topic {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-large);
      padding: 1rem;
      background: var(--surface-3);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .topic-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .levels {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .level-card {
      padding: 0.7rem;
      border-radius: var(--radius-large);
      background: var(--surface-2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .level-actions {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 0.25rem;
    }

    .level-actions button {
      padding: 0.35rem 0.6rem;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .row-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    button {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.55rem 1rem;
      font-weight: 600;
      cursor: pointer;
    }

    button.primary {
      background: var(--primary-main);
      color: #fff;
      border-color: transparent;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    input,
    textarea,
    select {
      border-radius: var(--radius-large);
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: var(--surface-1);
      color: var(--text-main);
      padding: 0.45rem 0.75rem;
      font: inherit;
    }

    @media (max-width: 640px) {
      .topic-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;

  private readonly client = new ApiClient({ jwt: authService.getToken() ?? undefined });
  @state() private topics: TopicSummary[] = [];
  @state() private levelsByTopic: Record<string, LevelSummary[]> = {};
  @state() private newTopic: TopicCreatePayload = { slug: '', name: '' };
  @state() private creatingTopic = false;
  @state() private loadingTopics = false;
  @state() private levelDrafts: Record<string, LevelDraft> = {};
  @state() private errors?: string;
  @state() private reorderingTopicId?: string;

  connectedCallback() {
    super.connectedCallback();
    this.loadTopics();
  }

  render() {
    return html`
      <section>
        <header>
          <div>
            <h2>Темы и уровни</h2>
            <p class="row-meta">
              Работает с реальными темами и уровнями через Admin API.
            </p>
          </div>
          <button class="primary" @click=${this.loadTopics}>Обновить темы</button>
        </header>
        <div class="form-grid">
          <label>
            Slug
            <input
              type="text"
              .value=${this.newTopic.slug}
              @input=${(event: Event) =>
                (this.newTopic = {
                  ...this.newTopic,
                  slug: (event.currentTarget as HTMLInputElement).value,
                })}
              placeholder="orthography"
            />
          </label>
          <label>
            Название
            <input
              type="text"
              .value=${this.newTopic.name}
              @input=${(event: Event) =>
                (this.newTopic = {
                  ...this.newTopic,
                  name: (event.currentTarget as HTMLInputElement).value,
                })}
            />
          </label>
          <label>
            Описание
            <textarea
              .value=${this.newTopic.description ?? ''}
              @input=${(event: Event) =>
                (this.newTopic = {
                  ...this.newTopic,
                  description: (event.currentTarget as HTMLTextAreaElement).value,
                })}
            ></textarea>
          </label>
        </div>
        <button
          class="primary"
          @click=${this.handleCreateTopic}
          ?disabled=${this.creatingTopic}
        >
          ${this.creatingTopic ? 'Создаём...' : 'Создать тему'}
        </button>
        ${this.errors ? html`<p class="row-meta">${this.errors}</p>` : null}
        ${this.renderTopicList()}
      </section>
    `;
  }

  private renderTopicList() {
    if (this.loadingTopics) {
      return html`<p class="row-meta">Загружаем темы...</p>`;
    }
    if (!this.topics.length) {
      return html`<p class="row-meta">Тем пока нет.</p>`;
    }
    return html`
      <div class="topic-list">
        ${this.topics.map(
          (topic) => html`
            <article class="topic">
              <div class="topic-header">
                <div>
                  <h3>${topic.name}</h3>
                  <p class="row-meta">${topic.slug} • ${topic.status}</p>
                </div>
                <div class="actions">
                  <button @click=${() => this.toggleTopicStatus(topic)}>Статус</button>
                  <button @click=${() => this.reloadLevels(topic.id)}>Уровни</button>
                </div>
              </div>
              <p>${topic.description}</p>
              ${this.levelsByTopic[topic.id]
                ? html`
                    <div class="levels">
                      ${this.levelsByTopic[topic.id].map((level, index, arr) => {
                        const isReordering = this.reorderingTopicId === topic.id;
                        const isFirst = index === 0;
                        const isLast = index === arr.length - 1;
                        return html`
                          <div class="level-card">
                            <strong>${level.name}</strong>
                            <span class="row-meta">Сложность: ${level.difficulty}</span>
                            <span class="row-meta">Порядок: ${level.order}</span>
                            <span class="row-meta">Статус: ${level.status}</span>
                            <div class="level-actions">
                              <button
                                class="secondary"
                                ?disabled=${isFirst || isReordering}
                                title="Вверх"
                                @click=${() => this.moveLevel(topic.id, index, 'up')}
                              >
                                ↑
                              </button>
                              <button
                                class="secondary"
                                ?disabled=${isLast || isReordering}
                                title="Вниз"
                                @click=${() => this.moveLevel(topic.id, index, 'down')}
                              >
                                ↓
                              </button>
                              ${isReordering
                                ? html`<span class="row-meta">Сохраняем порядок...</span>`
                                : null}
                            </div>
                          </div>
                        `;
                      })}
                    </div>
                  `
                : html`<p class="row-meta">Уровни не загружены.</p>`}
              ${this.renderLevelForm(topic.id)}
            </article>
          `,
        )}
      </div>
    `;
  }

  private renderLevelForm(topicId: string) {
    const draft = this.levelDrafts[topicId];
    return html`
      <div class="form-grid">
        <label>
          Название уровня
          <input
            type="text"
            .value=${draft?.name ?? ''}
            @input=${(event: Event) =>
              this.updateLevelDraft(
                topicId,
                'name',
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>
        <label>
          Сложность
          <select
            .value=${draft?.difficulty ?? 'A1'}
            @change=${(event: Event) =>
              this.updateLevelDraft(
                topicId,
                'difficulty',
                (event.currentTarget as HTMLSelectElement)
                  .value as LevelSummary['difficulty'],
              )}
          >
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
          </select>
        </label>
        <label>
          Минимум %
          <input
            type="number"
            min="60"
            max="100"
            .value=${String(draft?.min_pass_percent ?? 80)}
            @input=${(event: Event) =>
              this.updateLevelDraft(
                topicId,
                'min_pass_percent',
                Number((event.currentTarget as HTMLInputElement).value),
              )}
          />
        </label>
      </div>
      <button class="primary" @click=${() => this.handleCreateLevel(topicId)}>
        Добавить уровень
      </button>
    `;
  }

  private async loadTopics() {
    this.loadingTopics = true;
    this.errors = undefined;
    try {
      this.topics = await this.client.listTopics();
    } catch (error) {
      this.errors = error instanceof Error ? error.message : 'Не удалось загрузить темы';
    } finally {
      this.loadingTopics = false;
    }
  }

  private async handleCreateTopic() {
    if (!this.newTopic.slug || !this.newTopic.name) {
      return;
    }
    this.creatingTopic = true;
    try {
      await this.client.createTopic(this.newTopic);
      this.newTopic = { slug: '', name: '', description: '' };
      await this.loadTopics();
    } catch (error) {
      this.errors = error instanceof Error ? error.message : 'Не удалось создать тему';
    } finally {
      this.creatingTopic = false;
    }
  }

  private async toggleTopicStatus(topic: TopicSummary) {
    const nextStatus = topic.status === 'active' ? 'deprecated' : 'active';
    try {
      await this.client.updateTopic(topic.id, { status: nextStatus });
      await this.loadTopics();
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось обновить статус темы';
    }
  }

  private async reloadLevels(topicId: string) {
    try {
      const levels = await this.client.listLevels(topicId);
      this.levelsByTopic = { ...this.levelsByTopic, [topicId]: levels };
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось загрузить уровни';
    }
  }

  private updateLevelDraft(
    topicId: string,
    field: keyof LevelDraft,
    value: string | number,
  ) {
    const existing = this.levelDrafts[topicId] ?? {
      name: '',
      difficulty: 'A1',
      min_pass_percent: 80,
    };
    this.levelDrafts = {
      ...this.levelDrafts,
      [topicId]: { ...existing, [field]: value },
    };
  }

  private async handleCreateLevel(topicId: string) {
    const draft = this.levelDrafts[topicId];
    if (!draft?.name) {
      return;
    }
    const payload: LevelCreatePayload = {
      topic_id: topicId,
      name: draft.name,
      difficulty: draft.difficulty,
      min_pass_percent: draft.min_pass_percent,
    };
    try {
      await this.client.createLevel(payload);
      delete this.levelDrafts[topicId];
      await this.reloadLevels(topicId);
    } catch (error) {
      this.errors = error instanceof Error ? error.message : 'Не удалось создать уровень';
    }
  }

  private async moveLevel(topicId: string, index: number, direction: 'up' | 'down') {
    const levels = this.levelsByTopic[topicId];
    if (!levels) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= levels.length) {
      return;
    }
    const ordering = levels.map((level) => level.id);
    [ordering[index], ordering[targetIndex]] = [ordering[targetIndex], ordering[index]];
    await this.applyLevelOrdering(topicId, ordering);
  }

  private async applyLevelOrdering(topicId: string, ordering: string[]) {
    this.reorderingTopicId = topicId;
    this.errors = undefined;
    try {
      await this.client.reorderLevels({ ordering });
      await this.reloadLevels(topicId);
    } catch (error) {
      this.errors =
        error instanceof Error ? error.message : 'Не удалось переупорядочить уровни';
    } finally {
      this.reorderingTopicId = undefined;
    }
  }
}
