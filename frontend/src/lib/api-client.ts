import { nanoid } from 'nanoid';
import type {
  AdminTemplateDetail,
  AdminTemplateSummary,
  AdminTemplateUpdatePayload,
  CreateSessionPayload,
  CreateSessionResponse,
  ExportRequestPayload,
  ExportResponsePayload,
  FeatureFlagRecord,
  FeatureFlagUpdatePayload,
  GroupStatsResponse,
  QueueStatus,
  RequestHintPayload,
  RequestHintResponse,
  SessionResponse,
  SubmitAnswerResponse,
  SubmitAnswerPayload,
  TemplateFilterParams,
  TemplateRevertPayload,
} from './api-types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const STATS_BASE = import.meta.env.VITE_REPORTING_API ?? '/stats';
const ADMIN_BASE = '/admin';

export interface ApiClientOptions {
  jwt?: string;
}

export class ApiClient {
  private jwt?: string;

  constructor(options: ApiClientOptions = {}) {
    this.jwt = options.jwt;
  }

  setToken(token?: string) {
    this.jwt = token;
  }

  async createSession(payload: CreateSessionPayload, signal?: AbortSignal) {
    return this.request<CreateSessionResponse>(`${API_BASE}/sessions/`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  }

  async getSession(sessionId: string) {
    return this.request<SessionResponse>(`${API_BASE}/sessions/${sessionId}`);
  }

  async completeSession(sessionId: string) {
    return this.request<void>(`${API_BASE}/sessions/${sessionId}/complete`, {
      method: 'POST',
    });
  }

  async submitAnswer(sessionId: string, payload: SubmitAnswerPayload) {
    const body = {
      ...payload,
      idempotency_key: payload.idempotency_key ?? nanoid(),
    };
    return this.request<SubmitAnswerResponse>(
      `${API_BASE}/sessions/${sessionId}/answers`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async requestHint(sessionId: string, payload: RequestHintPayload) {
    const body = {
      ...payload,
      idempotency_key: payload.idempotency_key ?? nanoid(),
    };
    return this.request<RequestHintResponse>(`${API_BASE}/sessions/${sessionId}/hints`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.jwt) {
      headers.set('Authorization', `Bearer ${this.jwt}`);
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = await safeParseJson(response);
      throw new Error(detail?.message ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async getGroupStats(groupId: string, signal?: AbortSignal) {
    return this.request<GroupStatsResponse>(`${STATS_BASE}/groups/${groupId}`, {
      signal,
    });
  }

  async requestGroupExport(groupId: string, payload: ExportRequestPayload) {
    return this.request<ExportResponsePayload>(`${STATS_BASE}/groups/${groupId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listAdminTemplates(filters: TemplateFilterParams = {}) {
    const query = new URLSearchParams();
    if (filters.status) {
      query.append('status', filters.status);
    }
    if (filters.topic_id) {
      query.append('topic_id', filters.topic_id);
    }
    if (filters.level_id) {
      query.append('level_id', filters.level_id);
    }
    if (filters.difficulty) {
      query.append('difficulty', filters.difficulty);
    }
    if (typeof filters.version === 'number') {
      query.append('version', filters.version.toString());
    }
    if (filters.q) {
      query.append('q', filters.q);
    }
    if (typeof filters.limit === 'number') {
      query.append('limit', filters.limit.toString());
    }
    const queryString = query.toString();
    const url = `${ADMIN_BASE}/templates${queryString ? `?${queryString}` : ''}`;
    return this.request<AdminTemplateSummary[]>(url);
  }

  async getAdminTemplate(templateId: string) {
    return this.request<AdminTemplateDetail>(`${ADMIN_BASE}/templates/${templateId}`);
  }

  async updateAdminTemplate(templateId: string, payload: AdminTemplateUpdatePayload) {
    return this.request<AdminTemplateSummary>(`${ADMIN_BASE}/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async revertAdminTemplate(templateId: string, payload: TemplateRevertPayload) {
    return this.request<AdminTemplateSummary>(
      `${ADMIN_BASE}/templates/${templateId}/revert`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  async getEmbeddingQueueStatus() {
    return this.request<QueueStatus>(`${ADMIN_BASE}/queue`);
  }

  async listFeatureFlags() {
    return this.request<FeatureFlagRecord[]>(`${ADMIN_BASE}/feature-flags`);
  }

  async updateFeatureFlag(flagName: string, payload: FeatureFlagUpdatePayload) {
    return this.request<FeatureFlagRecord>(`${ADMIN_BASE}/feature-flags/${flagName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    console.warn('Failed to parse error payload', error);
    return undefined;
  }
}
