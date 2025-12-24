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
