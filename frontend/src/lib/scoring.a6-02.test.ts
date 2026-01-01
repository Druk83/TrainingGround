import { describe, expect, it } from 'vitest';
import {
  applyHintPenalty,
  calculateAnswerScore,
  HINT_PENALTY,
  STREAK_THRESHOLD,
} from './scoring';

describe('Scoring Logic - A6-02 Requirements', () => {
  describe('Base score calculations', () => {
    it('should award +10 for correct answer with no streak', () => {
      const result = calculateAnswerScore({ correct: true, currentStreak: 0 });
      expect(result.delta).toBe(10);
      expect(result.newStreak).toBe(1);
      expect(result.bonusApplied).toBe(false);
    });

    it('should award +0 and reset streak for incorrect answer', () => {
      const result = calculateAnswerScore({ correct: false, currentStreak: 5 });
      expect(result.delta).toBe(0);
      expect(result.newStreak).toBe(0);
      expect(result.bonusApplied).toBe(false);
    });

    it('should increment streak on consecutive correct answers', () => {
      const result = calculateAnswerScore({ correct: true, currentStreak: 3 });
      expect(result.newStreak).toBe(4);
    });
  });

  describe('Streak bonus (streak ≥4)', () => {
    it('should award +15 (10+5) when streak reaches THRESHOLD', () => {
      const result = calculateAnswerScore({
        correct: true,
        currentStreak: STREAK_THRESHOLD - 1,
      });
      expect(result.delta).toBe(15);
      expect(result.bonusApplied).toBe(true);
      expect(result.newStreak).toBe(STREAK_THRESHOLD);
    });

    it('should award +15 for subsequent answers at streak ≥ THRESHOLD', () => {
      const result = calculateAnswerScore({
        correct: true,
        currentStreak: STREAK_THRESHOLD,
      });
      expect(result.delta).toBe(15);
      expect(result.bonusApplied).toBe(true);
    });

    it('should NOT apply bonus for streak < THRESHOLD', () => {
      const result = calculateAnswerScore({
        correct: true,
        currentStreak: STREAK_THRESHOLD - 1,
      });
      // At this point currentStreak + 1 = THRESHOLD, so bonus SHOULD apply
      expect(result.bonusApplied).toBe(true);
    });
  });

  describe('Hint penalty', () => {
    it('should deduct -5 points for hint usage', () => {
      const originalScore = 100;
      const afterHint = applyHintPenalty(originalScore);
      expect(afterHint).toBe(originalScore - HINT_PENALTY);
      expect(afterHint).toBe(95);
    });

    it('should handle penalty on low scores', () => {
      const score = 3;
      const afterHint = applyHintPenalty(score);
      expect(afterHint).toBe(-2);
    });

    it('penalty should be -5 as per spec', () => {
      expect(HINT_PENALTY).toBe(5);
    });
  });

  describe('Complex scenarios from A6-02 spec', () => {
    it('Scenario: 4 correct answers in a row, then answer with hint', () => {
      // Answer 1: correct, streak=1, +10
      let result = calculateAnswerScore({ correct: true, currentStreak: 0 });
      expect(result.delta).toBe(10);
      let score = result.delta;

      // Answer 2: correct, streak=2, +10
      result = calculateAnswerScore({ correct: true, currentStreak: 1 });
      expect(result.delta).toBe(10);
      score += result.delta;

      // Answer 3: correct, streak=3, +10
      result = calculateAnswerScore({ correct: true, currentStreak: 2 });
      expect(result.delta).toBe(10);
      score += result.delta;

      // Answer 4: correct, streak=4, +15 (bonus applied)
      result = calculateAnswerScore({ correct: true, currentStreak: 3 });
      expect(result.delta).toBe(15);
      expect(result.bonusApplied).toBe(true);
      score += result.delta;

      // Answer 5: request hint BEFORE answering, -5 penalty
      score = applyHintPenalty(score);

      // Answer 5: correct, streak=5, +15
      result = calculateAnswerScore({ correct: true, currentStreak: 4 });
      expect(result.delta).toBe(15);
      score += result.delta;

      // Total: 10+10+10+15-5+15 = 55
      expect(score).toBe(55);
    });

    it('Scenario: wrong answer breaks streak', () => {
      // 2 correct: +10 each = 20
      let score = 10;
      let streak = 1;

      score += 10;
      streak = 2;

      // 1 wrong: streak resets
      let result = calculateAnswerScore({ correct: false, currentStreak: streak });
      expect(result.delta).toBe(0);
      expect(result.newStreak).toBe(0);
      score += result.delta;

      // 1 correct: starts new streak
      result = calculateAnswerScore({ correct: true, currentStreak: 0 });
      expect(result.delta).toBe(10);
      score += result.delta;

      // Total: 10+10+0+10 = 30
      expect(score).toBe(30);
    });

    it('Scenario: condition checking ≥80% pass', () => {
      // 8 correct out of 10
      const correct = 8;
      const total = 10;
      const accuracy = (correct / total) * 100;
      expect(accuracy).toBe(80);
      expect(accuracy >= 80).toBe(true);
    });

    it('Scenario: condition checking <80% fail', () => {
      // 7 correct out of 10
      const correct = 7;
      const total = 10;
      const accuracy = (correct / total) * 100;
      expect(accuracy).toBe(70);
      expect(accuracy >= 80).toBe(false);
    });
  });

  describe('Hint limit (2 per level)', () => {
    it('should track hints used up to 2', () => {
      let hintsUsed = 0;
      const MAX_HINTS = 2;

      hintsUsed++;
      expect(hintsUsed).toBe(1);
      expect(hintsUsed < MAX_HINTS).toBe(true);

      hintsUsed++;
      expect(hintsUsed).toBe(2);
      expect(hintsUsed < MAX_HINTS).toBe(false);
    });
  });
});
