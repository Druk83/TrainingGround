import { describe, expect, it } from 'vitest';
import {
  AnswerScoreResult,
  applyHintPenalty,
  calculateAnswerScore,
  HINT_PENALTY,
  STREAK_THRESHOLD,
} from './scoring';

describe('scoring utilities', () => {
  it('awards zero points and resets streak when answer is incorrect', () => {
    const result = calculateAnswerScore({ correct: false, currentStreak: 3 });
    expect(result).toStrictEqual<AnswerScoreResult>({
      delta: 0,
      newStreak: 0,
      bonusApplied: false,
    });
  });

  it('awards base score and increments streak for a correct answer', () => {
    const result = calculateAnswerScore({ correct: true, currentStreak: 1 });
    expect(result.delta).toBe(10);
    expect(result.newStreak).toBe(2);
    expect(result.bonusApplied).toBe(false);
  });

  it('adds streak bonus when reaching the threshold', () => {
    const result = calculateAnswerScore({
      correct: true,
      currentStreak: STREAK_THRESHOLD - 1,
    });
    expect(result.delta).toBe(15);
    expect(result.newStreak).toBe(STREAK_THRESHOLD);
    expect(result.bonusApplied).toBe(true);
  });

  it('penalizes score for hint usage', () => {
    const afterHint = applyHintPenalty(50);
    expect(afterHint).toBe(50 - HINT_PENALTY);
  });
});
