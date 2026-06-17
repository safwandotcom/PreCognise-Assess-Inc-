import { QuestionType } from "@/types";

/**
 * Scores a single candidate response.
 *
 * - psychometric / rating: no "correct" answer — always award full basePoints
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

  if (!isCorrect) {
    return 0;
  }

  const timeLimitMs = timeLimitSec * 1000;
  const speedFactor =
    timeLimitMs > 0 ? Math.max(0, 1 - responseTimeMs / timeLimitMs) : 0;
  const speedBonus = Math.floor(speedBonusMax * speedFactor);

  return basePoints + speedBonus;
}