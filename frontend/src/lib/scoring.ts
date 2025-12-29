export const BASE_SCORE = 10;
export const STREAK_BONUS = 5;
export const STREAK_THRESHOLD = 4;
export const HINT_PENALTY = 5;

export interface AnswerScoreInput {
  correct: boolean;
  currentStreak: number;
}

export interface AnswerScoreResult {
  delta: number;
  newStreak: number;
  bonusApplied: boolean;
}

export function calculateAnswerScore({
  correct,
  currentStreak,
}: AnswerScoreInput): AnswerScoreResult {
  if (!correct) {
    return { delta: 0, newStreak: 0, bonusApplied: false };
  }

  const nextStreak = currentStreak + 1;
  const bonusApplied = nextStreak >= STREAK_THRESHOLD;
  const delta = BASE_SCORE + (bonusApplied ? STREAK_BONUS : 0);

  return {
    delta,
    newStreak: nextStreak,
    bonusApplied,
  };
}

export function applyHintPenalty(currentScore: number) {
  return currentScore - HINT_PENALTY;
}
