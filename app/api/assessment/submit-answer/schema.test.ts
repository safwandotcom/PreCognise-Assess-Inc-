import { test } from "node:test";
import assert from "node:assert/strict";
import { submitAnswerSchema } from "./schema";

test("submitAnswerSchema: accepts an MCQ-style numeric answer", () => {
  const result = submitAnswerSchema.safeParse({ questionId: "q1", value: 2, responseTimeMs: 4200 });
  assert.equal(result.success, true);
});

test("submitAnswerSchema: accepts a multi_select array answer", () => {
  const result = submitAnswerSchema.safeParse({
    questionId: "q1",
    value: [0, 2],
    responseTimeMs: 4200,
  });
  assert.equal(result.success, true);
});

test("submitAnswerSchema: accepts a short/long-answer string, and a null (no answer)", () => {
  assert.equal(
    submitAnswerSchema.safeParse({ questionId: "q1", value: "free text", responseTimeMs: 100 }).success,
    true,
  );
  assert.equal(
    submitAnswerSchema.safeParse({ questionId: "q1", value: null, responseTimeMs: 100 }).success,
    true,
  );
});

test("submitAnswerSchema: value is optional (undefined is allowed)", () => {
  const result = submitAnswerSchema.safeParse({ questionId: "q1", responseTimeMs: 100 });
  assert.equal(result.success, true);
});

test("submitAnswerSchema: rejects a missing questionId or non-numeric responseTimeMs", () => {
  assert.equal(submitAnswerSchema.safeParse({ value: 1, responseTimeMs: 100 }).success, false);
  assert.equal(
    submitAnswerSchema.safeParse({ questionId: "q1", value: 1, responseTimeMs: "100" }).success,
    false,
  );
});
