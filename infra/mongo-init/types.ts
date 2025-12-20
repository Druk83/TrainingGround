// TypeScript type definitions for MongoDB collections
// Generated from JSON Schema validation rules

export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  sso_provider: 'yandex' | 'vk' | 'gosuslugi' | null;
  sso_id: string | null;
  groups: string[]; // ObjectId references
  preferences: {
    theme?: 'light' | 'dark';
    notifications?: boolean;
    [key: string]: unknown;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  _id: string;
  name: string;
  teacher_id: string; // ObjectId reference
  student_ids: string[]; // ObjectId references
  settings: {
    allow_hints?: boolean;
    max_attempts?: number;
    [key: string]: unknown;
  };
  createdAt: Date;
}

export interface Topic {
  _id: string;
  slug: string;
  name: string;
  description: string;
  order: number;
}

export interface Level {
  _id: string;
  topic_id: string; // ObjectId reference
  order: number;
  name: string;
  unlock_condition: {
    required_accuracy?: number;
    required_level_id?: string;
    [key: string]: unknown;
  };
}

export interface Template {
  _id: string;
  level_id: string; // ObjectId reference
  rule_ids: string[]; // ObjectId references
  params: {
    [key: string]: unknown;
  };
  version: number;
  active: boolean;
  createdAt: Date;
}

export interface Task {
  _id: string;
  template_id: string; // ObjectId reference
  session_id: string;
  content: {
    sentence: string;
    blanks: number[];
    options?: string[];
    [key: string]: unknown;
  };
  correct_answer: string;
  hints: Array<{
    text: string;
    cost: number;
  }>;
  createdAt: Date;
  // TTL: 30 days
}

export interface Attempt {
  _id: string;
  session_id: string;
  task_id: string; // ObjectId reference
  user_answer: string;
  is_correct: boolean;
  hints_used: number;
  time_spent_ms: number;
  timestamp: Date;
}

export interface ProgressSummary {
  _id: string;
  user_id: string; // ObjectId reference
  level_id: string; // ObjectId reference
  correct_count: number;
  total_count: number;
  accuracy: number; // 0-100
  avg_time_ms: number;
  updatedAt: Date;
}

export interface HintLog {
  _id: string;
  session_id: string;
  task_id: string; // ObjectId reference
  hint_index: number;
  timestamp: Date;
}

export interface Rule {
  _id: string;
  slug: string;
  name: string;
  description: string;
  examples: Array<{
    correct: string;
    incorrect?: string;
    explanation: string;
  }>;
  metadata: {
    difficulty?: 'easy' | 'medium' | 'hard';
    frequency?: number;
    [key: string]: unknown;
  };
}

export interface Incident {
  _id: string;
  user_id: string; // ObjectId reference
  session_id: string;
  type: 'tab_switch' | 'rapid_submit' | 'pattern_abuse' | 'impossible_time';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    [key: string]: unknown;
  };
  timestamp: Date;
}

export interface FeatureFlag {
  _id: string;
  flag_name: string;
  enabled: boolean;
  rollout_percentage: number; // 0-100
  target_groups: string[]; // group slugs or IDs
  updatedAt: Date;
}

export interface MaterializedStats {
  _id: string;
  type: 'group' | 'level' | 'topic';
  entity_id: string; // ObjectId reference
  metrics: {
    total_users?: number;
    avg_accuracy?: number;
    total_attempts?: number;
    [key: string]: unknown;
  };
  calculatedAt: Date;
}

export interface Leaderboard {
  _id: string;
  scope: 'global' | 'group' | 'level';
  scope_id: string | null; // ObjectId reference
  rankings: Array<{
    user_id: string;
    score: number;
    rank: number;
    name: string;
  }>;
  generatedAt: Date;
  // TTL: 24 hours
}

// Change Stream event types
export interface TemplateChangeEvent {
  operationType: 'insert' | 'update' | 'delete' | 'replace';
  fullDocument?: Template;
  documentKey: { _id: string };
  updateDescription?: {
    updatedFields: Partial<Template>;
    removedFields: string[];
  };
}

export interface RuleChangeEvent {
  operationType: 'insert' | 'update' | 'delete' | 'replace';
  fullDocument?: Rule;
  documentKey: { _id: string };
  updateDescription?: {
    updatedFields: Partial<Rule>;
    removedFields: string[];
  };
}
