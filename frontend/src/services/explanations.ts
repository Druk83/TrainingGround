export interface ExplanationRequest {
  taskId: string;
  topicId?: string;
  taskType?: string;
  userErrors?: string[];
  languageLevel?: string;
  language?: string;
  requestId?: string;
}

export interface ExplanationResponse {
  explanation: string;
  ruleRefs: string[];
  source: 'cache' | 'yandexgpt' | 'fallback';
  tookMs: number;
  generatedAt: string;
}

const DEFAULT_BASE = '/api/explanations';
const globalApiOverride = (globalThis as unknown as { __EXPLANATION_API__?: string })
  .__EXPLANATION_API__;

const viteApiOverride = (
  import.meta as unknown as { env?: { VITE_EXPLANATION_API?: string } }
).env?.VITE_EXPLANATION_API;

const API_BASE: string = globalApiOverride ?? viteApiOverride ?? DEFAULT_BASE;

export async function requestExplanation(
  payload: ExplanationRequest,
  signal?: AbortSignal,
): Promise<ExplanationResponse> {
  const body = JSON.stringify({
    task_id: payload.taskId,
    topic_id: payload.topicId,
    task_type: payload.taskType,
    user_errors: payload.userErrors ?? [],
    language_level: payload.languageLevel,
    language: payload.language ?? 'ru',
    request_id: payload.requestId,
  });

  const response = await fetch(`${API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Explanation request failed with status ${response.status}`);
  }

  const data = await response.json();
  return {
    explanation: data.explanation,
    ruleRefs: data.rule_refs ?? [],
    source: data.source ?? 'fallback',
    tookMs: data.took_ms ?? 0,
    generatedAt: data.generated_at,
  };
}
