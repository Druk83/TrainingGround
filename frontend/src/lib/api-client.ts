import { nanoid } from 'nanoid';
import type {
  CreateSessionPayload,
  CreateSessionResponse,
  ExportRequestPayload,
  ExportResponsePayload,
  GroupStatsResponse,
  RequestHintPayload,
  RequestHintResponse,
  SessionResponse,
  SubmitAnswerPayload,
  SubmitAnswerResponse,
} from './api-types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const STATS_BASE = import.meta.env.VITE_REPORTING_API ?? '/stats';

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
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    console.warn('Failed to parse error payload', error);
    return undefined;
  }
}
