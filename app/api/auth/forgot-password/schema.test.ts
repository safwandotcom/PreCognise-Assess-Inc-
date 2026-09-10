import { test } from "node:test";
import assert from "node:assert/strict";
import { forgotPasswordSchema } from "./schema";

test("forgotPasswordSchema: accepts a valid body", () => {
  const result = forgotPasswordSchema.safeParse({ email: "a@b.com", joinToken: "tok" });
  assert.equal(result.success, true);
});

test("forgotPasswordSchema: rejects a missing email or joinToken", () => {
  assert.equal(forgotPasswordSchema.safeParse({ joinToken: "tok" }).success, false);
  assert.equal(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success, false);
});

test("forgotPasswordSchema: rejects whitespace-only values", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "   ", joinToken: "tok" }).success, false);
  assert.equal(forgotPasswordSchema.safeParse({ email: "a@b.com", joinToken: "   " }).success, false);
});

test("forgotPasswordSchema: trims email but not joinToken", () => {
  const result = forgotPasswordSchema.safeParse({ email: "  a@b.com  ", joinToken: "  tok  " });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.email, "a@b.com");
    // Not trimmed: route.ts looks this up against the DB raw.
    assert.equal(result.data.joinToken, "  tok  ");
  }
});
