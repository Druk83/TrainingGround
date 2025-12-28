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

export type AdminTemplateStatus = 'draft' | 'ready' | 'published' | 'deprecated';

export interface LevelSummary {
  id: string;
  name: string;
  order: number;
  topic_id: string;
}

export interface TopicSummary {
  id: string;
  slug: string;
  name: string;
}

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

export interface TemplateRevertPayload {
  reason: string;
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
