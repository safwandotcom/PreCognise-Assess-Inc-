import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedAdminEmail } from "./admin-allowlist";

test("isAllowedAdminEmail: allows any email when ADMIN_ALLOWED_EMAILS is unset (not yet configured)", () => {
  const original = process.env.ADMIN_ALLOWED_EMAILS;
  delete process.env.ADMIN_ALLOWED_EMAILS;
  assert.equal(isAllowedAdminEmail("anyone@example.com"), true);
  if (original !== undefined) process.env.ADMIN_ALLOWED_EMAILS = original;
});

test("isAllowedAdminEmail: allows an email on the list", () => {
  process.env.ADMIN_ALLOWED_EMAILS = "staff@precognise.co, other@precognise.co";
  assert.equal(isAllowedAdminEmail("staff@precognise.co"), true);
  delete process.env.ADMIN_ALLOWED_EMAILS;
});

test("isAllowedAdminEmail: is case-insensitive and trims whitespace", () => {
  process.env.ADMIN_ALLOWED_EMAILS = " Staff@Precognise.co ,other@precognise.co";
  assert.equal(isAllowedAdminEmail("staff@PRECOGNISE.co"), true);
  delete process.env.ADMIN_ALLOWED_EMAILS;
});

test("isAllowedAdminEmail: rejects an email not on a configured list", () => {
  process.env.ADMIN_ALLOWED_EMAILS = "staff@precognise.co";
  assert.equal(isAllowedAdminEmail("stranger@example.com"), false);
  delete process.env.ADMIN_ALLOWED_EMAILS;
});

test("isAllowedAdminEmail: rejects a missing email once a list is configured", () => {
  process.env.ADMIN_ALLOWED_EMAILS = "staff@precognise.co";
  assert.equal(isAllowedAdminEmail(null), false);
  assert.equal(isAllowedAdminEmail(undefined), false);
  delete process.env.ADMIN_ALLOWED_EMAILS;
});
