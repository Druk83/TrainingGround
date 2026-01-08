import { nanoid } from 'nanoid';
import type {
  ActivityEntry,
  AdminTemplateCreatePayload,
  AdminTemplateDetail,
  AdminTemplateSummary,
  AdminTemplateUpdatePayload,
  AnticheatSettings,
  AuditLogEntry,
  AuditLogQueryParams,
  BackupCreateRequest,
  BackupCreateResponse,
  BackupRecord,
  BackupRestoreResponse,
  BlockUserRequest,
  BulkUserActionRequest,
  BulkUserActionResult,
  CreateGroupRequest,
  CreateNotificationTemplatePayload,
  CreateSessionPayload,
  CreateSessionResponse,
  CreateUserRequest,
  EmailSettings,
  EmbeddingConsistencyReport,
  EmbeddingJobSummary,
  EmbeddingRebuildPayload,
  ExportRequestPayload,
  ExportResponsePayload,
  ExportStatusPayload,
  FeatureFlagRecord,
  FeatureFlagUpdatePayload,
  GroupResponse,
  GroupStatsResponse,
  IncidentWithUser,
  LevelCreatePayload,
  LevelReorderPayload,
  LevelSummary,
  LevelUpdatePayload,
  ListGroupsQuery,
  ListIncidentsQuery,
  ListUsersQuery,
  NotificationHistoryEntry,
  NotificationTemplate,
  QueueStatus,
  RecommendationEntry,
  RequestHintPayload,
  RequestHintResponse,
  ResetPasswordResponse,
  RuleCoverage,
  RuleCreatePayload,
  RuleSummary,
  RuleUpdatePayload,
  SendNotificationPayload,
  SendNotificationResponse,
  SessionResponse,
  SettingsTestResponse,
  SsoSettings,
  StudentCoursesResponse,
  StudentStatsResponse,
  SubmitAnswerPayload,
  SubmitAnswerResponse,
  SystemMetrics,
  SystemSettingsResponse,
  TeacherStudentDetail,
  TeacherStudentSummary,
  TemplateDuplicate,
  TemplateFilterParams,
  TemplateRevertPayload,
  TemplateValidationIssue,
  TemplateVersionSummary,
  TopicAnalyticsEntry,
  TopicCreatePayload,
  TopicSummary,
  TopicUpdatePayload,
  UpdateGroupRequest,
  UpdateIncidentRequest,
  UpdateUserRequest,
  UserDetailResponse,
  YandexGptSettings,
} from './api-types';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const rawApiBase =
  import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? undefined;

const backendOriginFromApi =
  rawApiBase && rawApiBase.startsWith('http')
    ? rawApiBase.replace(/\/api\/?.*$/, '')
    : undefined;

const inferredLocalBackend =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8081`
    : undefined;

const BACKEND_ORIGIN =
  import.meta.env.VITE_BACKEND_ORIGIN ??
  backendOriginFromApi ??
  inferredLocalBackend ??
  'http://localhost:8081';

const shouldUseDevProxy =
  import.meta.env.DEV && import.meta.env.VITE_USE_PROXY !== 'false';

const API_BASE = stripTrailingSlash(
  shouldUseDevProxy ? '/api/v1' : (rawApiBase ?? `${BACKEND_ORIGIN}/api/v1`),
);
const STATS_BASE = stripTrailingSlash(
  shouldUseDevProxy
    ? '/stats'
    : (import.meta.env.VITE_REPORTING_API ?? `${BACKEND_ORIGIN}/stats`),
);
const ADMIN_BASE = stripTrailingSlash(
  shouldUseDevProxy
    ? '/admin'
    : (import.meta.env.VITE_ADMIN_BASE ??
        import.meta.env.VITE_ADMIN_URL ??
        `${BACKEND_ORIGIN}/admin`),
);
const TEACHER_BASE = stripTrailingSlash(`${API_BASE}/teacher`);
const STUDENT_BASE = stripTrailingSlash(`${API_BASE}/student`);

type MongoObjectId = {
  $oid?: string;
};

type RawAuditLogResponse = {
  _id?: string | MongoObjectId | null;
  id?: string;
  event_type: AuditLogEntry['event_type'];
  user_id?: string;
  email?: string;
  success: boolean;
  ip?: string;
  user_agent?: string;
  details?: string;
  error_message?: string;
  createdAt?: string;
  created_at?: string;
};

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
      const response = await fetch(`${API_BASE}/auth/csrf-token`, {
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

  async listStudentCourses() {
    return this.request<StudentCoursesResponse>(`${STUDENT_BASE}/courses`);
  }

  async getStudentStats() {
    return this.request<StudentStatsResponse>(`${STUDENT_BASE}/stats`);
  }

  async startStudentSession(templateId: string) {
    return this.request<CreateSessionResponse>(`${STUDENT_BASE}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId }),
    });
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestRaw(url, init);

    if (!response.ok) {
      const detail = await safeParseJson(response);

      // Try to get more info from response
      let errorMessage = detail?.message ?? detail?.detail ?? detail?.error;
      if (!errorMessage) {
        // If no JSON error, try to get text
        try {
          const text = await response.text();
          if (text && text.length > 0 && text.length < 500) {
            errorMessage = text;
          }
        } catch {
          // ignore
        }
      }

      throw new Error(errorMessage ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async requestRaw(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.jwt) {
      headers.set('Authorization', `Bearer ${this.jwt}`);
    }

    // Add CSRF token and nonce for state-changing operations
    const method = init.method?.toUpperCase() || 'GET';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (this.csrfToken) {
        headers.set('X-CSRF-Token', this.csrfToken);
      }
      // Add nonce and timestamp for CSRF validation
      const nonce = crypto.randomUUID();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      headers.set('X-Request-Nonce', nonce);
      headers.set('X-Request-Timestamp', timestamp);
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
          return this.requestRaw(url, { ...init, headers: retryHeaders });
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

    return response;
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

  async getExportStatus(exportId: string) {
    return this.request<ExportStatusPayload>(`${STATS_BASE}/exports/${exportId}`);
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

  async createAdminTemplate(payload: AdminTemplateCreatePayload) {
    return this.request<AdminTemplateSummary>(`${ADMIN_BASE}/templates`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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

  async listTemplateVersions(templateId: string) {
    return this.request<TemplateVersionSummary[]>(
      `${ADMIN_BASE}/templates/${templateId}/versions`,
    );
  }

  async submitTemplateForModeration(templateId: string) {
    return this.request<AdminTemplateSummary>(
      `${ADMIN_BASE}/templates/${templateId}/submit`,
      {
        method: 'POST',
      },
    );
  }

  async approveTemplate(templateId: string) {
    return this.request<AdminTemplateSummary>(
      `${ADMIN_BASE}/templates/${templateId}/approve`,
      {
        method: 'POST',
      },
    );
  }

  async rejectTemplate(templateId: string, payload: TemplateRevertPayload) {
    return this.request<AdminTemplateSummary>(
      `${ADMIN_BASE}/templates/${templateId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  async validateTemplates() {
    return this.request<TemplateValidationIssue[]>(`${ADMIN_BASE}/templates/validate`, {
      method: 'POST',
    });
  }

  async listDuplicates() {
    return this.request<TemplateDuplicate[]>(`${ADMIN_BASE}/templates/duplicates`);
  }

  async rebuildEmbeddings(payload: EmbeddingRebuildPayload) {
    return this.request<EmbeddingJobSummary>(`${ADMIN_BASE}/embeddings/rebuild`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getEmbeddingProgress() {
    return this.request<EmbeddingJobSummary>(`${ADMIN_BASE}/embeddings/progress`);
  }

  async getEmbeddingConsistency() {
    return this.request<EmbeddingConsistencyReport>(
      `${ADMIN_BASE}/embeddings/consistency`,
    );
  }

  async listTopics() {
    return this.request<TopicSummary[]>(`${ADMIN_BASE}/topics`);
  }

  async createTopic(payload: TopicCreatePayload) {
    return this.request<TopicSummary>(`${ADMIN_BASE}/topics`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateTopic(topicId: string, payload: TopicUpdatePayload) {
    return this.request<TopicSummary>(`${ADMIN_BASE}/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteTopic(topicId: string) {
    return this.request(`${ADMIN_BASE}/topics/${topicId}`, {
      method: 'DELETE',
    });
  }

  async listLevels(topicId: string) {
    return this.request<LevelSummary[]>(`${ADMIN_BASE}/topics/${topicId}/levels`);
  }

  async createLevel(payload: LevelCreatePayload) {
    return this.request<LevelSummary>(`${ADMIN_BASE}/levels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateLevel(levelId: string, payload: LevelUpdatePayload) {
    return this.request<LevelSummary>(`${ADMIN_BASE}/levels/${levelId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteLevel(levelId: string) {
    return this.request(`${ADMIN_BASE}/levels/${levelId}`, {
      method: 'DELETE',
    });
  }

  async reorderLevels(payload: LevelReorderPayload) {
    return this.request(`${ADMIN_BASE}/levels/reorder`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listRules() {
    return this.request<RuleSummary[]>(`${ADMIN_BASE}/rules`);
  }

  async createRule(payload: RuleCreatePayload) {
    return this.request<RuleSummary>(`${ADMIN_BASE}/rules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRule(ruleId: string, payload: RuleUpdatePayload) {
    return this.request<RuleSummary>(`${ADMIN_BASE}/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteRule(ruleId: string) {
    return this.request(`${ADMIN_BASE}/rules/${ruleId}`, {
      method: 'DELETE',
    });
  }

  async getRuleCoverage() {
    return this.request<RuleCoverage[]>(`${ADMIN_BASE}/rules/coverage`);
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

  async listUsers(query?: ListUsersQuery) {
    const params = new URLSearchParams();
    if (query?.role) params.set('role', query.role);
    if (query?.group_id) params.set('group_id', query.group_id);
    if (query?.is_blocked !== undefined)
      params.set('is_blocked', String(query.is_blocked));
    if (query?.search) params.set('search', query.search);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));

    const queryString = params.toString();
    const url = `${ADMIN_BASE}/users${queryString ? `?${queryString}` : ''}`;
    return this.request<UserDetailResponse[]>(url);
  }

  async getUser(userId: string) {
    return this.request<UserDetailResponse>(`${ADMIN_BASE}/users/${userId}`);
  }

  async createUser(payload: CreateUserRequest) {
    return this.request<UserDetailResponse>(`${ADMIN_BASE}/users`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateUser(userId: string, payload: UpdateUserRequest) {
    return this.request<UserDetailResponse>(`${ADMIN_BASE}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteUser(userId: string) {
    return this.request<void>(`${ADMIN_BASE}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async blockUser(userId: string, payload: BlockUserRequest) {
    return this.request<UserDetailResponse>(`${ADMIN_BASE}/users/${userId}/block`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async unblockUser(userId: string) {
    return this.request<UserDetailResponse>(`${ADMIN_BASE}/users/${userId}/unblock`, {
      method: 'POST',
    });
  }

  async bulkUserAction(payload: BulkUserActionRequest) {
    return this.request<BulkUserActionResult>(`${ADMIN_BASE}/users/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async resetUserPassword(userId: string) {
    return this.request<ResetPasswordResponse>(
      `${ADMIN_BASE}/users/${userId}/reset-password`,
      { method: 'POST' },
    );
  }

  async listGroups(query?: ListGroupsQuery) {
    const params = new URLSearchParams();
    if (query?.search) params.set('search', query.search);
    if (query?.school) params.set('school', query.school);
    if (query?.curator_id) params.set('curator_id', query.curator_id);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));

    const queryString = params.toString();
    const url = `${ADMIN_BASE}/groups${queryString ? `?${queryString}` : ''}`;
    return this.request<GroupResponse[]>(url);
  }

  async getGroup(groupId: string) {
    return this.request<GroupResponse>(`${ADMIN_BASE}/groups/${groupId}`);
  }

  async createGroup(payload: CreateGroupRequest) {
    return this.request<GroupResponse>(`${ADMIN_BASE}/groups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateGroup(groupId: string, payload: UpdateGroupRequest) {
    return this.request<GroupResponse>(`${ADMIN_BASE}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteGroup(groupId: string) {
    return this.request<void>(`${ADMIN_BASE}/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  async getSystemSettings() {
    return this.request<SystemSettingsResponse>(`${ADMIN_BASE}/settings`);
  }

  async updateYandexGptSettings(payload: YandexGptSettings) {
    return this.request<YandexGptSettings>(`${ADMIN_BASE}/settings/yandexgpt`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateSsoSettings(payload: SsoSettings) {
    return this.request<SsoSettings>(`${ADMIN_BASE}/settings/sso`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateEmailSettings(payload: EmailSettings) {
    return this.request<EmailSettings>(`${ADMIN_BASE}/settings/email`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateAnticheatSettings(payload: AnticheatSettings) {
    return this.request<AnticheatSettings>(`${ADMIN_BASE}/settings/anticheat`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async testYandexGptSettings() {
    return this.request<SettingsTestResponse>(`${ADMIN_BASE}/settings/test/yandexgpt`, {
      method: 'POST',
    });
  }

  async testSsoSettings() {
    return this.request<SettingsTestResponse>(`${ADMIN_BASE}/settings/test/sso`, {
      method: 'POST',
    });
  }

  async testEmailSettings() {
    return this.request<SettingsTestResponse>(`${ADMIN_BASE}/settings/test/email`, {
      method: 'POST',
    });
  }

  async getSystemMetrics() {
    return this.request<SystemMetrics>(`${ADMIN_BASE}/system/metrics`);
  }

  async listBackups() {
    return this.request<BackupRecord[]>(`${ADMIN_BASE}/backups`);
  }

  async createBackup(payload: BackupCreateRequest) {
    return this.request<BackupCreateResponse>(`${ADMIN_BASE}/backups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async restoreBackup(backupId: string) {
    return this.request<BackupRestoreResponse>(
      `${ADMIN_BASE}/backups/${backupId}/restore`,
      {
        method: 'POST',
      },
    );
  }

  async exportGroups() {
    const response = await this.requestRaw(`${ADMIN_BASE}/groups/export`);
    if (!response.ok) {
      const detail = await safeParseJson(response);
      throw new Error(detail?.message ?? `Request failed with ${response.status}`);
    }
    return response.blob();
  }

  async listTeacherGroups() {
    return this.request<GroupResponse[]>(`${TEACHER_BASE}/groups`);
  }

  async listTeacherGroupStudents(groupId: string) {
    return this.request<TeacherStudentSummary[]>(
      `${TEACHER_BASE}/groups/${groupId}/students`,
    );
  }

  async getTeacherStudentDetail(groupId: string, studentId: string) {
    return this.request<TeacherStudentDetail>(
      `${TEACHER_BASE}/groups/${groupId}/students/${studentId}`,
    );
  }

  private teacherAnalyticsUrl(path: string, groupId: string) {
    const params = new URLSearchParams({ groupId });
    return `${TEACHER_BASE}${path}?${params.toString()}`;
  }

  async getGroupTopicAnalytics(groupId: string) {
    return this.request<TopicAnalyticsEntry[]>(
      this.teacherAnalyticsUrl('/analytics/topics', groupId),
    );
  }

  async getGroupActivity(groupId: string) {
    return this.request<ActivityEntry[]>(
      this.teacherAnalyticsUrl('/analytics/activity', groupId),
    );
  }

  async getGroupRecommendations(groupId: string) {
    return this.request<RecommendationEntry[]>(
      this.teacherAnalyticsUrl('/analytics/recommendations', groupId),
    );
  }

  async listTeacherNotificationTemplates() {
    return this.request<NotificationTemplate[]>(
      `${TEACHER_BASE}/notifications/templates`,
    );
  }

  async createTeacherNotificationTemplate(payload: CreateNotificationTemplatePayload) {
    return this.request<NotificationTemplate>(`${TEACHER_BASE}/notifications/templates`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendTeacherNotification(payload: SendNotificationPayload) {
    return this.request<SendNotificationResponse>(`${TEACHER_BASE}/notifications/send`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listTeacherNotificationHistory() {
    return this.request<NotificationHistoryEntry[]>(
      `${TEACHER_BASE}/notifications/history`,
    );
  }

  async listIncidents(query?: ListIncidentsQuery) {
    const queryString = this.buildIncidentQueryString(query);
    return this.request<IncidentWithUser[]>(`${ADMIN_BASE}/incidents${queryString}`);
  }

  async getIncident(incidentId: string) {
    return this.request<IncidentWithUser>(`${ADMIN_BASE}/incidents/${incidentId}`);
  }

  async updateIncident(incidentId: string, payload: UpdateIncidentRequest) {
    return this.request<IncidentWithUser>(`${ADMIN_BASE}/incidents/${incidentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async unblockIncidentUser(incidentId: string) {
    return this.request<UserDetailResponse>(
      `${ADMIN_BASE}/incidents/${incidentId}/unblock`,
      {
        method: 'POST',
      },
    );
  }

  async listAuditLogs(query?: AuditLogQueryParams) {
    const queryString = this.buildAuditQueryString(query);
    const rawLogs = await this.request<RawAuditLogResponse[]>(
      `${ADMIN_BASE}/audit${queryString}`,
    );
    return rawLogs.map((entry) => this.normalizeAuditLogEntry(entry));
  }

  async exportAuditLogs(query?: AuditLogQueryParams) {
    const queryString = this.buildAuditQueryString(query);
    const response = await this.requestRaw(`${ADMIN_BASE}/audit/export${queryString}`);
    if (!response.ok) {
      const detail = await safeParseJson(response);
      throw new Error(detail?.message ?? `Request failed with ${response.status}`);
    }
    return response.blob();
  }

  private buildAuditQueryString(query?: AuditLogQueryParams) {
    if (!query) {
      return '';
    }

    const params = new URLSearchParams();
    if (query.event_type) params.set('event_type', query.event_type);
    if (query.user_id) params.set('user_id', query.user_id);
    if (typeof query.success === 'boolean') params.set('success', String(query.success));
    if (query.search) params.set('search', query.search);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    if (typeof query.offset === 'number') params.set('offset', String(query.offset));

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }

  private buildIncidentQueryString(query?: ListIncidentsQuery) {
    if (!query) return '';
    const params = new URLSearchParams();
    if (query.incident_type) params.set('incident_type', query.incident_type);
    if (query.severity) params.set('severity', query.severity);
    if (query.status) params.set('status', query.status);
    if (query.user_id) params.set('user_id', query.user_id);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));
    if (typeof query.offset === 'number') params.set('offset', String(query.offset));
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }

  private normalizeAuditLogEntry(entry: RawAuditLogResponse): AuditLogEntry {
    const rawId = entry.id ?? entry._id;
    let normalizedId: string | undefined;
    if (typeof rawId === 'string') {
      normalizedId = rawId;
    } else if (rawId && typeof rawId === 'object') {
      normalizedId = rawId.$oid;
    }

    return {
      id: normalizedId,
      event_type: entry.event_type,
      user_id: entry.user_id,
      email: entry.email,
      success: entry.success,
      ip: entry.ip,
      user_agent: entry.user_agent,
      details: entry.details,
      error_message: entry.error_message,
      createdAt: entry.createdAt ?? entry.created_at ?? new Date().toISOString(),
    };
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

export { API_BASE, STUDENT_BASE };
export type { StudentStatsResponse };
