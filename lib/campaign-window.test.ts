import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignCloseAt, campaignLastEntryAt } from "./campaign-window";

const BASE = { scheduledEnd: null as Date | null, startedAt: null as Date | null, gracePeriodMin: 10, durationSec: 0 };

test("campaignCloseAt: scheduledEnd set — returns it directly", () => {
  const scheduledEnd = new Date("2026-09-04T21:00:00.000Z");
  const result = campaignCloseAt({ scheduledEnd });
  assert.equal(result?.getTime(), scheduledEnd.getTime());
});

test("campaignCloseAt: no scheduledEnd ⇒ no hard close, ever — regardless of gracePeriodMin or startedAt", () => {
  // Regression case: an earlier (buggy) version fell back to
  // startedAt/scheduledAt + gracePeriodMin here, force-ending in-progress
  // exams ~10 minutes after campaign start. scheduledEnd unset must mean
  // "no hard cutoff at all," full stop — huge gracePeriodMin and a
  // long-past startedAt must not change that.
  const result = campaignCloseAt({ scheduledEnd: null });
  assert.equal(result, null);
});

test("campaignLastEntryAt: scheduledEnd set — subtracts durationSec", () => {
  // 9pm close, 43-minute exam → 8:17pm last entry (matches the 43-min/9pm/8:17pm example)
  const scheduledEnd = new Date("2026-09-04T21:00:00.000Z");
  const result = campaignLastEntryAt({
    ...BASE,
    scheduledEnd,
    durationSec: 43 * 60,
  });
  assert.equal(result?.getTime(), scheduledEnd.getTime() - 43 * 60_000);
});

test("campaignLastEntryAt: scheduledEnd unset — legacy fallback anchors to startedAt, not scheduledAt", () => {
  // Regression case: the legacy fallback must be measured from startedAt
  // (when the campaign actually went live), never scheduledAt (when it was
  // merely scheduled to). Construct a startedAt well after a would-be
  // scheduledAt reference time and confirm the fallback anchors to startedAt.
  const wouldBeScheduledAt = new Date("2026-09-04T10:00:00.000Z");
  const startedAt = new Date("2026-09-04T18:00:00.000Z"); // started 8h later than scheduled
  const result = campaignLastEntryAt({ ...BASE, startedAt, gracePeriodMin: 10 });
  assert.equal(result?.getTime(), startedAt.getTime() + 10 * 60_000);
  assert.notEqual(result?.getTime(), wouldBeScheduledAt.getTime() + 10 * 60_000);
});

test("campaignLastEntryAt: scheduledEnd unset, no startedAt — null (campaign hasn't gone live)", () => {
  const result = campaignLastEntryAt({ ...BASE, startedAt: null, gracePeriodMin: 10 });
  assert.equal(result, null);
});

test("campaignLastEntryAt: scheduledEnd unset, gracePeriodMin === 0 — no cutoff (null), anchored at startedAt", () => {
  const result = campaignLastEntryAt({
    ...BASE,
    startedAt: new Date("2026-09-04T18:00:00.000Z"),
    gracePeriodMin: 0,
  });
  assert.equal(result, null);
});
