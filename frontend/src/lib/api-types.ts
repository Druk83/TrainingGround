export interface TaskInfo {
  id: string;
  title: string;
  description: string;
  time_limit_seconds: number;
}

export type SessionStatus = 'active' | 'completed' | 'expired' | 'abandoned';

export interface SessionResponse {
  id: string;
  user_id: string;
  task_id: string;
  group_id?: string;
  started_at: string;
  expires_at: string;
  status: SessionStatus;
  hints_used: number;
  score: number;
}

export interface CreateSessionPayload {
  user_id: string;
  task_id: string;
  group_id?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  task: TaskInfo;
  expires_at: string;
}

export interface SubmitAnswerPayload {
  answer: string;
  idempotency_key?: string;
}

export interface SubmitAnswerResponse {
  correct: boolean;
  score_awarded: number;
  combo_bonus: number;
  total_score: number;
  current_streak: number;
  feedback?: string;
}

export interface RequestHintPayload {
  idempotency_key?: string;
  topic_id?: string;
  task_type?: string;
  user_errors?: string[];
  language_level?: string;
  language?: string;
}

export interface RequestHintResponse {
  hint: string;
  hint_text: string;
  hints_used: number;
  hints_remaining: number;
  cost: number;
  new_score: number;
}

export interface TimerTickEvent {
  type: 'timer-tick';
  session_id: string;
  remaining_seconds: number;
  elapsed_seconds: number;
  total_seconds: number;
  timestamp: string;
}

export interface TimeExpiredEvent {
  type: 'time-expired';
  session_id: string;
  timestamp: string;
  message: string;
}

export type TimerEvent = TimerTickEvent | TimeExpiredEvent;

export interface AnalyticsEnvelope {
  sessionId: string;
  userId: string;
  averageKeypressMs: number;
  burstKeypresses: number;
  source: 'ui' | 'offline-sync';
  recordedAt: string;
}

export interface MaterializedStat {
  id: string;
  stat_type: 'group' | 'level' | 'topic';
  entity_id: string;
  metrics: {
    avg_accuracy?: number;
    avg_score?: number;
    total_attempts?: number;
    total_users?: number;
  };
  calculated_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  score: number;
  rank: number;
  name: string;
}

export interface LeaderboardDocument {
  scope: 'global' | 'group' | 'level';
  scope_id?: string | null;
  rankings: LeaderboardEntry[];
  generated_at: string;
}

export interface GroupStatsResponse {
  group_id: string;
  stats: MaterializedStat;
  leaderboard?: LeaderboardDocument;
}

export interface ExportRequestPayload {
  topic_ids: string[];
  period: {
    from: string;
    to: string;
  };
  format: 'csv' | 'pdf';
}

export interface ExportResponsePayload {
  export_id: string;
  status: string;
  expires_at: string;
}

export type AdminTemplateStatus =
  | 'draft'
  | 'pending_review'
  | 'reviewed_once'
  | 'ready'
  | 'published'
  | 'deprecated';

export interface AdminTemplateSummary {
  id: string;
  slug: string;
  status: AdminTemplateStatus;
  version: number;
  difficulty?: string;
  level?: LevelSummary;
  topic?: TopicSummary;
  pii_flags: string[];
  source_refs: string[];
  updated_at: string;
}

export interface TopicSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_url?: string | null;
  sort_order: number;
  status: 'active' | 'deprecated';
  created_at: string;
  updated_at: string;
}

export interface TopicCreatePayload {
  slug: string;
  name: string;
  description?: string;
  icon_url?: string;
  status?: 'active' | 'deprecated';
}

export interface TopicUpdatePayload {
  name?: string;
  description?: string;
  icon_url?: string;
  status?: 'active' | 'deprecated';
}

export interface LevelSummary {
  id: string;
  name: string;
  difficulty: 'A1' | 'A2' | 'B1' | 'B2';
  order: number;
  status: 'active' | 'deprecated';
  topic_id: string;
}

export interface LevelCreatePayload {
  topic_id: string;
  name: string;
  difficulty: 'A1' | 'A2' | 'B1' | 'B2';
  description?: string;
  min_pass_percent?: number;
  sort_order?: number;
}

export interface LevelUpdatePayload {
  name?: string;
  description?: string;
  difficulty?: 'A1' | 'A2' | 'B1' | 'B2';
  min_pass_percent?: number;
  status?: 'active' | 'deprecated';
}

export interface LevelReorderPayload {
  ordering: string[];
}

export interface RuleSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  examples: string[];
  exceptions: string[];
  sources: string[];
  status: 'active' | 'deprecated';
}

export interface RuleCreatePayload {
  name: string;
  category: string;
  description: string;
  examples?: string[];
  exceptions?: string[];
  sources?: string[];
  status?: 'active' | 'deprecated';
}

export interface RuleUpdatePayload {
  name?: string;
  category?: string;
  description?: string;
  examples?: string[];
  exceptions?: string[];
  sources?: string[];
  status?: 'active' | 'deprecated';
}

export interface RuleCoverage {
  rule_id: string;
  linked_templates: number;
}

export interface AdminTemplateDetail extends AdminTemplateSummary {
  content: string;
  params: Record<string, unknown>;
  metadata: Record<string, unknown>;
  rule_ids: string[];
  created_at: string;
}

export interface TemplateFilterParams {
  status?: AdminTemplateStatus;
  topic_id?: string;
  level_id?: string;
  difficulty?: string;
  version?: number;
  q?: string;
  limit?: number;
}

export interface AdminTemplateUpdatePayload {
  status?: AdminTemplateStatus;
  content?: string;
  difficulty?: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  source_refs?: string[];
}

export interface AdminTemplateCreatePayload {
  slug: string;
  level_id: string;
  rule_ids: string[];
  content: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  difficulty?: string;
  source_refs?: string[];
}

export interface TemplateRevertPayload {
  reason: string;
}

export interface TemplateVersionSummary {
  version: number;
  created_at: string;
  created_by?: string;
  changes: Record<string, unknown>;
}

export interface TemplateValidationIssue {
  template_id: string;
  slug: string;
  reason: string;
  severity: string;
}

export interface TemplateDuplicate {
  template_a: string;
  template_b: string;
  similarity: number;
  reason: string;
}

export interface EmbeddingJobSummary {
  id: string;
  mode: string;
  status: string;
  total: number;
  processed: number;
  created_at: string;
}

export interface EmbeddingRebuildPayload {
  mode: 'all' | 'changed' | 'new' | 'selected';
  template_ids?: string[];
}

export interface EmbeddingConsistencyReport {
  mongo_templates: number;
  qdrant_vectors: number;
  discrepancies: string[];
}

export interface QueueStatus {
  length: number;
  last_event?: ContentChangeEvent;
}

export interface ContentChangeEvent {
  id: string;
  template_id: string;
  action: string;
  version?: string;
  timestamp?: string;
}

export interface FeatureFlagRecord {
  id: string;
  flag_name: string;
  enabled: boolean;
  rollout_percentage?: number;
  target_groups: string[];
  updated_at: string;
}

export interface FeatureFlagUpdatePayload {
  enabled: boolean;
}

export type UserRole = 'student' | 'teacher' | 'content_admin' | 'admin';

export interface UserDetailResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  group_ids: string[];
  is_blocked: boolean;
  blocked_until?: string;
  block_reason?: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  group_ids?: string[];
}

export interface UpdateUserRequest {
  name?: string;
  role?: UserRole;
  group_ids?: string[];
  is_blocked?: boolean;
}

export interface BlockUserRequest {
  reason: string;
  duration_hours?: number;
}

export type BulkUserOperation =
  | { type: 'block'; reason: string; duration_hours?: number }
  | { type: 'unblock' }
  | { type: 'set_groups'; group_ids: string[] };

export interface BulkUserActionRequest {
  user_ids: string[];
  operation: BulkUserOperation;
}

export interface BulkUserActionResult {
  processed: number;
  failed: Array<{ user_id: string; error: string }>;
}

export interface ResetPasswordResponse {
  status: string;
  temporary_password?: string;
}

export interface ListUsersQuery {
  role?: string;
  group_id?: string;
  is_blocked?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface GroupResponse {
  id: string;
  name: string;
  school: string;
  curator_id?: string;
  curator_name?: string;
  description?: string;
  student_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateGroupRequest {
  name: string;
  school: string;
  curator_id?: string;
  description?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  school?: string;
  curator_id?: string;
  description?: string;
}

export interface ListGroupsQuery {
  search?: string;
  school?: string;
  curator_id?: string;
  limit?: number;
  offset?: number;
}

export interface YandexGptSettings {
  api_key: string;
  folder_id: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface SsoSettings {
  enabled: boolean;
  provider: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface EmailSettings {
  server: string;
  port: number;
  login: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

export interface AnticheatSettings {
  speed_threshold_seconds: number;
  max_speed_hits: number;
  max_repeated_hits: number;
  block_duration_hours: number;
  captcha_enabled: boolean;
  captcha_threshold: number;
}

export interface SystemSettingsResponse {
  yandexgpt?: YandexGptSettings;
  sso?: SsoSettings;
  email?: EmailSettings;
  anticheat?: AnticheatSettings;
}

export interface SettingsTestResponse {
  success: boolean;
  message?: string;
}

export interface SystemMetrics {
  uptime_seconds: number;
  total_users: number;
  blocked_users: number;
  total_groups: number;
  total_incidents: number;
  open_incidents: number;
  critical_incidents: number;
  audit_events_24h: number;
  active_sessions: number;
}

export interface BackupRecord {
  id?: string;
  label: string;
  status: 'Pending' | 'Completed' | 'Failed';
  storage_path?: string;
  error?: string;
  created_at: string;
}

export interface BackupCreateRequest {
  label?: string;
}

export interface BackupCreateResponse {
  id: string;
  status: 'Pending' | 'Completed' | 'Failed';
  storage_path?: string;
}

export interface BackupRestoreResponse {
  id: string;
  status: 'Pending' | 'Completed' | 'Failed';
  storage_path?: string;
  message: string;
}

export type AuditEventType =
  | 'login'
  | 'login_failed'
  | 'register'
  | 'register_failed'
  | 'logout'
  | 'refresh_token'
  | 'refresh_token_failed'
  | 'change_password'
  | 'change_password_failed'
  | 'revoke_session'
  | 'update_user'
  | 'access_denied'
  | 'create_user'
  | 'delete_user'
  | 'block_user'
  | 'unblock_user'
  | 'create_group'
  | 'update_group'
  | 'delete_group';

export interface AuditLogEntry {
  id?: string;
  event_type: AuditEventType;
  user_id?: string;
  email?: string;
  success: boolean;
  ip?: string;
  user_agent?: string;
  details?: string;
  error_message?: string;
  createdAt: string;
}

export interface AuditLogQueryParams {
  event_type?: AuditEventType;
  user_id?: string;
  success?: boolean;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export type IncidentType = 'speed_violation' | 'repeated_answers' | 'suspicious_pattern';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'resolved' | 'false_positive';

export type IncidentActionTaken = 'none' | 'flagged' | 'suspended' | 'blocked';

export interface IncidentDetails {
  speed_hits?: number;
  repeated_hits?: number;
  time_window_seconds?: number;
  additional_info?: string;
}

export interface IncidentRecord {
  id: string;
  user_id: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  details: IncidentDetails;
  timestamp: string;
  action_taken: IncidentActionTaken;
  status: IncidentStatus;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

export interface IncidentUserInfo {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_blocked: boolean;
}

export interface IncidentWithUser {
  incident: IncidentRecord;
  user?: IncidentUserInfo | null;
}

export interface ListIncidentsQuery {
  incident_type?: IncidentType;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  user_id?: string;
  limit?: number;
  offset?: number;
}

export type IncidentResolutionAction = 'resolve' | 'false_positive';

export interface UpdateIncidentRequest {
  action: IncidentResolutionAction;
  note?: string;
}
