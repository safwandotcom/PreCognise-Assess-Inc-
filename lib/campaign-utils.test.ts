import { test } from "node:test";
import assert from "node:assert/strict";
import { CampaignStatus } from "@prisma/client";
import { canEditQuestions } from "./campaign-utils";

test("canEditQuestions: true for DRAFT", () => {
  assert.equal(canEditQuestions(CampaignStatus.DRAFT), true);
});

test("canEditQuestions: true for SCHEDULED", () => {
  assert.equal(canEditQuestions(CampaignStatus.SCHEDULED), true);
});

test("canEditQuestions: false for LIVE", () => {
  assert.equal(canEditQuestions(CampaignStatus.LIVE), false);
});

test("canEditQuestions: false for PAUSED", () => {
  assert.equal(canEditQuestions(CampaignStatus.PAUSED), false);
});

test("canEditQuestions: false for ENDED", () => {
  assert.equal(canEditQuestions(CampaignStatus.ENDED), false);
});
