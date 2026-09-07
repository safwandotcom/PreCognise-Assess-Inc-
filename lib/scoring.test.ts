import { test } from "node:test";
import assert from "node:assert/strict";
import { QuestionType } from "@/types";
import {
  isMultiSelectAnswerCorrect,
  calculateScore,
  applyNegativeMarking,
  calculatePercentileRank,
  calculateDiscriminationIndex,
  calculatePValue,
} from "./scoring";

// ── isMultiSelectAnswerCorrect ──────────────────────────────────────────────

test("isMultiSelectAnswerCorrect: exact match, different order, is correct", () => {
  assert.equal(isMultiSelectAnswerCorrect([2, 0, 1], [0, 1, 2]), true);
});

test("isMultiSelectAnswerCorrect: missing a correct option is wrong", () => {
  assert.equal(isMultiSelectAnswerCorrect([0, 1], [0, 1, 2]), false);
});

test("isMultiSelectAnswerCorrect: an extra wrong option is wrong, even with all correct ones present", () => {
  assert.equal(isMultiSelectAnswerCorrect([0, 1, 2, 3], [0, 1, 2]), false);
});

test("isMultiSelectAnswerCorrect: same length, different members, is wrong", () => {
  assert.equal(isMultiSelectAnswerCorrect([0, 1, 3], [0, 1, 2]), false);
});

test("isMultiSelectAnswerCorrect: both empty is correct (no options selected, none required)", () => {
  assert.equal(isMultiSelectAnswerCorrect([], []), true);
});

// ── calculateScore ──────────────────────────────────────────────────────────

test("calculateScore: psychometric always awards basePoints regardless of isCorrect", () => {
  assert.equal(calculateScore(false, QuestionType.PSYCHOMETRIC, 10, 5, 3000, 60), 10);
  assert.equal(calculateScore(true, QuestionType.PSYCHOMETRIC, 10, 5, 3000, 60), 10);
});

test("calculateScore: rating always awards basePoints regardless of isCorrect", () => {
  assert.equal(calculateScore(false, QuestionType.RATING, 10, 5, 3000, 60), 10);
});

test("calculateScore: short_answer is always 0 at submission time (graded manually later)", () => {
  assert.equal(calculateScore(true, QuestionType.SHORT_ANSWER, 10, 5, 3000, 60), 0);
});

test("calculateScore: long_answer is always 0 at submission time (graded manually later)", () => {
  assert.equal(calculateScore(true, QuestionType.LONG_ANSWER, 10, 5, 3000, 60), 0);
});

test("calculateScore: wrong mcq answer scores 0, no speed bonus", () => {
  assert.equal(calculateScore(false, QuestionType.MCQ, 10, 5, 0, 60), 0);
});

test("calculateScore: correct answer submitted instantly (0ms) gets the full speed bonus", () => {
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 5, 0, 60), 15);
});

test("calculateScore: correct answer submitted at exactly the time limit gets zero speed bonus", () => {
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 5, 60_000, 60), 10);
});

test("calculateScore: correct answer at half the time limit gets half the speed bonus, floored", () => {
  // speedFactor = 1 - 30000/60000 = 0.5; floor(5 * 0.5) = 2
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 5, 30_000, 60), 12);
});

test("calculateScore: response time past the limit doesn't go negative — speed bonus floors at 0, not below", () => {
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 5, 90_000, 60), 10);
});

test("calculateScore: a zero time limit disables the speed bonus entirely rather than dividing by zero", () => {
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 5, 1000, 0), 10);
});

test("calculateScore: multi_select uses the same correct/speed-bonus scoring as mcq", () => {
  assert.equal(calculateScore(true, QuestionType.MULTI_SELECT, 10, 5, 0, 60), 15);
  assert.equal(calculateScore(false, QuestionType.MULTI_SELECT, 10, 5, 0, 60), 0);
});

test("calculateScore: a question with no speed bonus configured awards base points only", () => {
  assert.equal(calculateScore(true, QuestionType.MCQ, 10, 0, 0, 60), 10);
});

// ── applyNegativeMarking ─────────────────────────────────────────────────────
// From app/api/assessment/score/route.ts: only explicitly wrong (answered,
// scored 0) responses are penalized at basePoints * negativeMarkingValue per
// question; skipped/blank answers are never penalized; the result floors at 0.

test("applyNegativeMarking: no wrong answers leaves the score untouched", () => {
  assert.equal(applyNegativeMarking(50, [], 0.25), 50);
});

test("applyNegativeMarking: deducts basePoints * negativeMarkingValue per wrong answer", () => {
  // two wrong answers worth 10 base points each, at a 0.25 penalty rate: -5
  assert.equal(applyNegativeMarking(50, [10, 10], 0.25), 45);
});

test("applyNegativeMarking: floors the final score at 0, never negative", () => {
  assert.equal(applyNegativeMarking(5, [10, 10, 10], 0.25), 0);
});

test("applyNegativeMarking: a zero penalty rate deducts nothing", () => {
  assert.equal(applyNegativeMarking(50, [10, 10], 0), 50);
});

// ── calculatePercentileRank ──────────────────────────────────────────────────
// From app/api/assessment/score/route.ts: percentage of completed peers this
// candidate outscored; null with no completed peers to compare against (not
// 0 — "beat nobody" and "nobody to compare to" are different states).

test("calculatePercentileRank: null with no completed peers", () => {
  assert.equal(calculatePercentileRank(80, []), null);
});

test("calculatePercentileRank: beating every peer is the 100th percentile", () => {
  assert.equal(calculatePercentileRank(80, [10, 20, 30]), 100);
});

test("calculatePercentileRank: beating no peers is the 0th percentile", () => {
  assert.equal(calculatePercentileRank(5, [10, 20, 30]), 0);
});

test("calculatePercentileRank: a tie does not count as beaten", () => {
  // beats 1 of 3 (the 10) — the tied 30 doesn't count as scored-below
  assert.equal(calculatePercentileRank(30, [10, 30, 30]), Math.round((1 / 3) * 100));
});

// ── calculatePValue ──────────────────────────────────────────────────────────
// From the analytics route: % of respondents who answered a question
// correctly — the standard difficulty metric, rounded to one decimal place.

test("calculatePValue: 0 with nobody answering, not a divide-by-zero error", () => {
  assert.equal(calculatePValue(0, 0), 0);
});

test("calculatePValue: everyone correct is 100", () => {
  assert.equal(calculatePValue(10, 10), 100);
});

test("calculatePValue: rounds to one decimal place", () => {
  // 1/3 = 33.333...% -> 33.3
  assert.equal(calculatePValue(1, 3), 33.3);
});

// ── calculateDiscriminationIndex ─────────────────────────────────────────────
// From the analytics route: (top-half correct rate) - (bottom-half correct
// rate), rounded to two decimal places. 0 when either half is empty (can't
// discriminate with nothing to compare).

test("calculateDiscriminationIndex: 0 when the top half is empty", () => {
  assert.equal(calculateDiscriminationIndex(0, 0, 3, 5), 0);
});

test("calculateDiscriminationIndex: 0 when the bottom half is empty", () => {
  assert.equal(calculateDiscriminationIndex(5, 5, 0, 0), 0);
});

test("calculateDiscriminationIndex: a question every top scorer gets right and every bottom scorer gets wrong has an index of 1", () => {
  assert.equal(calculateDiscriminationIndex(5, 5, 0, 5), 1);
});

test("calculateDiscriminationIndex: equal correct rates in both halves discriminate nothing", () => {
  assert.equal(calculateDiscriminationIndex(3, 5, 3, 5), 0);
});

test("calculateDiscriminationIndex: a question the bottom half does better on is negative", () => {
  assert.equal(calculateDiscriminationIndex(1, 5, 4, 5), -0.6);
});
