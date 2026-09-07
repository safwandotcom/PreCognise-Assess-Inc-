import { QuestionType } from "@/types";

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

/**
 * Scores a single candidate response.
 *
 * - psychometric / rating: no "correct" answer — always award full basePoints
 * - short_answer / long_answer: always 0 at submission time — graded manually
 *     later via PATCH /api/admin/responses/[id]/grade
 * - mcq / image / true_false: scored against correctOption
 *     correct -> basePoints + speed bonus (faster = more bonus, capped at speedBonusMax)
 *     wrong   -> 0
 * - multi_select: scored against correctOptions via isMultiSelectAnswerCorrect (see above)
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

/**
 * Negative marking (app/api/assessment/score/route.ts): deducts
 * basePoints * negativeMarkingValue for each explicitly wrong answer —
 * skipped/blank responses are never included in wrongAnswerBasePoints in
 * the first place, so they're never penalized. Floors the final score at 0.
 */
export function applyNegativeMarking(
  totalScore: number,
  wrongAnswerBasePoints: number[],
  negativeMarkingValue: number
): number {
  const penalty = wrongAnswerBasePoints.reduce(
    (sum, basePoints) => sum + basePoints * negativeMarkingValue,
    0
  );
  return Math.max(0, totalScore - penalty);
}

/**
 * Percentile rank among completed peers (app/api/assessment/score/route.ts):
 * the percentage of peers this candidate outscored. A tie doesn't count as
 * "scored below". Null (not 0) when there are no completed peers to compare
 * against — "beat nobody" and "nobody to compare to" are different states.
 */
export function calculatePercentileRank(
  score: number,
  peerScores: number[]
): number | null {
  if (peerScores.length < 1) return null;
  const scoredBelow = peerScores.filter((s) => s < score).length;
  return Math.round((scoredBelow / peerScores.length) * 100);
}

/**
 * Difficulty (P-value) for a question (analytics route): the percentage of
 * respondents who answered it correctly, rounded to one decimal place.
 */
export function calculatePValue(correct: number, answered: number): number {
  return answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0;
}

/**
 * Discrimination index for a question (analytics route): the difference
 * between the top-scoring half's correct rate and the bottom half's, rounded
 * to two decimal places. A high index means the question separates strong
 * candidates from weak ones; near zero means it isn't doing useful work.
 * 0 when either half is empty — nothing to discriminate against.
 */
export function calculateDiscriminationIndex(
  topCorrect: number,
  topHalfSize: number,
  bottomCorrect: number,
  bottomHalfSize: number
): number {
  if (topHalfSize === 0 || bottomHalfSize === 0) return 0;
  return (
    Math.round(
      (topCorrect / topHalfSize - bottomCorrect / bottomHalfSize) * 100
    ) / 100
  );
}