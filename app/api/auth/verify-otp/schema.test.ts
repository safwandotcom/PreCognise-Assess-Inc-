import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOtpSchema } from "./schema";

const validBody = { email: "a@b.com", joinToken: "tok", code: "123456", newPassword: "hunter22" };

test("verifyOtpSchema: accepts a valid body", () => {
  assert.equal(verifyOtpSchema.safeParse(validBody).success, true);
});

test("verifyOtpSchema: rejects any missing field", () => {
  for (const key of Object.keys(validBody)) {
    const body = { ...validBody, [key]: undefined };
    assert.equal(verifyOtpSchema.safeParse(body).success, false, `expected missing ${key} to fail`);
  }
});

test("verifyOtpSchema: rejects whitespace-only fields", () => {
  for (const key of Object.keys(validBody)) {
    const body = { ...validBody, [key]: "   " };
    assert.equal(verifyOtpSchema.safeParse(body).success, false, `expected blank ${key} to fail`);
  }
});

test("verifyOtpSchema: trims email but leaves joinToken, code, and newPassword untouched", () => {
  const result = verifyOtpSchema.safeParse({
    email: "  a@b.com  ",
    joinToken: "  tok  ",
    code: "  123456  ",
    newPassword: "  hunter22  ",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.email, "a@b.com");
    assert.equal(result.data.joinToken, "  tok  ");
    assert.equal(result.data.code, "  123456  ");
    assert.equal(result.data.newPassword, "  hunter22  ");
  }
});
