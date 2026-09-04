import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignCloseAt, campaignLastEntryAt } from "./campaign-window";

const BASE = { scheduledAt: null as Date | null, scheduledEnd: null as Date | null, gracePeriodMin: 10, durationSec: 0 };

test("campaignCloseAt: scheduledEnd set — returns it directly, ignoring scheduledAt/gracePeriodMin", () => {
  const scheduledEnd = new Date("2026-09-04T21:00:00.000Z");
  const result = campaignCloseAt({
    ...BASE,
    scheduledAt: new Date("2026-09-04T18:00:00.000Z"),
    scheduledEnd,
    gracePeriodMin: 999,
  });
  assert.equal(result?.getTime(), scheduledEnd.getTime());
});

test("campaignCloseAt: scheduledEnd unset — falls back to scheduledAt + gracePeriodMin", () => {
  const scheduledAt = new Date("2026-09-04T18:00:00.000Z");
  const result = campaignCloseAt({ ...BASE, scheduledAt, gracePeriodMin: 10 });
  assert.equal(result?.getTime(), scheduledAt.getTime() + 10 * 60_000);
});

test("campaignCloseAt: scheduledEnd unset, gracePeriodMin === 0 — no cutoff (null)", () => {
  const result = campaignCloseAt({
    ...BASE,
    scheduledAt: new Date("2026-09-04T18:00:00.000Z"),
    gracePeriodMin: 0,
  });
  assert.equal(result, null);
});

test("campaignCloseAt: no scheduledAt and no scheduledEnd — null", () => {
  const result = campaignCloseAt({ ...BASE, scheduledAt: null, scheduledEnd: null });
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

test("campaignLastEntryAt: scheduledEnd unset — same as campaignCloseAt", () => {
  const scheduledAt = new Date("2026-09-04T18:00:00.000Z");
  const campaign = { ...BASE, scheduledAt, gracePeriodMin: 10, durationSec: 999999 };
  assert.equal(
    campaignLastEntryAt(campaign)?.getTime(),
    campaignCloseAt(campaign)?.getTime(),
  );
});
