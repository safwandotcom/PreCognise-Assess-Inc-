import { QuestionType } from "@/types";

/**
 * Scores a single candidate response.
 *
 * - psychometric / rating: no "correct" answer — always award full basePoints
 * - short_answer / long_answer: always 0 at submission time — graded manually
 *     later via PATCH /api/admin/responses/[id]/grade
 * - mcq / image: scored against correctOption
 *     correct -> basePoints + speed bonus (faster = more bonus, capped at speedBonusMax)
 *     wrong   -> 0
 */
export function calculateScore(
  isCorrect: boolean,
  questionType: QuestionType,
  basePoints: number,
  speedBonusMax: number,
  responseTimeMs: number,
  timeLimitSec: number
): number {
  if (
    questionType === QuestionType.PSYCHOMETRIC ||
    questionType === QuestionType.RATING
  ) {
    return basePoints;
  }

  if (
    questionType === QuestionType.SHORT_ANSWER ||
    questionType === QuestionType.LONG_ANSWER
  ) {
    // Manually graded later via PATCH /api/admin/responses/[id]/grade —
    // never auto-scored at submission time.
    return 0;
  }

  if (!isCorrect) {
    return 0;
  }

  const timeLimitMs = timeLimitSec * 1000;
  const speedFactor =
    timeLimitMs > 0 ? Math.max(0, 1 - responseTimeMs / timeLimitMs) : 0;
  const speedBonus = Math.floor(speedBonusMax * speedFactor);

  return basePoints + speedBonus;
}