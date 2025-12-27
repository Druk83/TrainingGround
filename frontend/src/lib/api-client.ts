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
  private csrfToken?: string;

  constructor(options: ApiClientOptions = {}) {
    this.jwt = options.jwt;
    // Fetch CSRF token on initialization
    this.fetchCsrfToken();
  }

  setToken(token?: string) {
    this.jwt = token;
  }

  /**
   * Fetch CSRF token from server
   * Called on initialization and can be called manually if needed
   */
  async fetchCsrfToken(): Promise<void> {
    try {
      const response = await fetch('/api/v1/auth/csrf-token', {
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const data = await response.json();
        this.csrfToken = data.csrf_token;
      }
    } catch (error) {
      console.warn('Failed to fetch CSRF token', error);
    }
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

    // Add CSRF token for state-changing operations
    const method = init.method?.toUpperCase() || 'GET';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && this.csrfToken) {
      headers.set('X-CSRF-Token', this.csrfToken);
    }

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include', // Include cookies in all requests
    });

    // Handle 401 Unauthorized - attempt token refresh
    if (response.status === 401) {
      // Try to refresh token (only once to avoid infinite loop)
      if (
        !init.headers ||
        !(init.headers as Record<string, string>)['X-Retry-After-Refresh']
      ) {
        const refreshed = await this.attemptTokenRefresh();
        if (refreshed) {
          // Retry original request with new token
          const retryHeaders = new Headers(init.headers ?? {});
          retryHeaders.set('X-Retry-After-Refresh', 'true');
          return this.request<T>(url, { ...init, headers: retryHeaders });
        }
      }

      // Refresh failed or already retried - redirect to login
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    // Handle 403 Forbidden
    if (response.status === 403) {
      window.location.href = '/forbidden';
      throw new Error('Access forbidden');
    }

    if (!response.ok) {
      const detail = await safeParseJson(response);
      throw new Error(detail?.message ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Attempt to refresh access token (refresh_token read from HTTP-only cookie)
   * Returns true if successful, false otherwise
   */
  private async attemptTokenRefresh(): Promise<boolean> {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookie
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const newToken = data.access_token;

      // Update token
      this.setToken(newToken);
      localStorage.setItem('access_token', newToken);

      return true;
    } catch (error) {
      console.error('Token refresh failed', error);
      return false;
    }
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
