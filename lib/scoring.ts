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
/**
 * Exact-set equality check for multi-select answers — order-independent.
 * The candidate's selected set must match the correct set precisely (same
 * length, same members) to count as correct; there is no partial credit.
 * Used by submit-answer to compute isCorrect for QuestionType.MULTI_SELECT,
 * which stores its answer key as an array (correctOptions) rather than the
 * single correctOption index every other option-based type uses.
 */
export function isMultiSelectAnswerCorrect(
  selected: number[],
  correctOptions: number[]
): boolean {
  if (selected.length !== correctOptions.length) return false;
  const sortedSelected = [...selected].sort((a, b) => a - b);
  const sortedCorrect = [...correctOptions].sort((a, b) => a - b);
  return sortedSelected.every((v, i) => v === sortedCorrect[i]);
}

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