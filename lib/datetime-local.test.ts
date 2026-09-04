import { test } from "node:test";
import assert from "node:assert/strict";
import { toDatetimeLocalValue, fromDatetimeLocalValue } from "./datetime-local";

// These tests must pass regardless of which timezone the machine running
// them is in — that's the whole point of the round-trip. Never hardcode an
// expected local-time string for a specific timezone.

test("round-trip: toDatetimeLocalValue then fromDatetimeLocalValue preserves the instant to the minute", () => {
  const original = new Date("2026-09-06T18:59:00.000Z");
  const localValue = toDatetimeLocalValue(original.toISOString());
  const roundTripped = fromDatetimeLocalValue(localValue);
  assert.ok(roundTripped);
  // Precision is limited to the minute by the datetime-local input format.
  assert.equal(
    new Date(roundTripped!).getTime(),
    Math.floor(original.getTime() / 60_000) * 60_000,
  );
});

test("toDatetimeLocalValue: null/undefined/empty all return empty string", () => {
  assert.equal(toDatetimeLocalValue(null), "");
  assert.equal(toDatetimeLocalValue(undefined), "");
  assert.equal(toDatetimeLocalValue(""), "");
});

test("toDatetimeLocalValue: invalid date string returns empty string", () => {
  assert.equal(toDatetimeLocalValue("not-a-date"), "");
});

test("fromDatetimeLocalValue: empty string returns null", () => {
  assert.equal(fromDatetimeLocalValue(""), null);
});

test("fromDatetimeLocalValue: invalid value returns null", () => {
  assert.equal(fromDatetimeLocalValue("not-a-date"), null);
});

test("fromDatetimeLocalValue: a real datetime-local value produces a real ISO string", () => {
  const result = fromDatetimeLocalValue("2026-09-06T18:59");
  assert.ok(result);
  assert.equal(Number.isNaN(new Date(result!).getTime()), false);
});
