import { test } from "node:test";
import assert from "node:assert/strict";
import { openLoginSchema, accessIdLoginSchema } from "./schema";

test("openLoginSchema: accepts a valid open-join body", () => {
  const result = openLoginSchema.safeParse({
    name: "Ada Lovelace",
    email: "ada@example.com",
    joinToken: "tok_123",
    consent: true,
  });
  assert.equal(result.success, true);
});

test("openLoginSchema: rejects a missing name or email", () => {
  assert.equal(openLoginSchema.safeParse({ email: "ada@example.com", consent: true }).success, false);
  assert.equal(openLoginSchema.safeParse({ name: "Ada", consent: true }).success, false);
});

test("openLoginSchema: rejects a whitespace-only name or email", () => {
  assert.equal(
    openLoginSchema.safeParse({ name: "   ", email: "ada@example.com", consent: true }).success,
    false,
  );
});

test("openLoginSchema: trims name and email", () => {
  const result = openLoginSchema.safeParse({
    name: "  Ada  ",
    email: "  ada@example.com  ",
    consent: true,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Ada");
    assert.equal(result.data.email, "ada@example.com");
  }
});

test("openLoginSchema: consent is passed through untouched, not coerced", () => {
  // route.ts does a strict `consent !== true` check afterward — the schema
  // must not turn a truthy-but-not-boolean consent value into `true`.
  const result = openLoginSchema.safeParse({ name: "Ada", email: "ada@example.com", consent: "yes" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.consent, "yes");
});

test("openLoginSchema: joinToken is optional and not trimmed", () => {
  const withToken = openLoginSchema.safeParse({
    name: "Ada",
    email: "ada@example.com",
    joinToken: "  tok  ",
  });
  assert.equal(withToken.success, true);
  if (withToken.success) assert.equal(withToken.data.joinToken, "  tok  ");

  const withoutToken = openLoginSchema.safeParse({ name: "Ada", email: "ada@example.com" });
  assert.equal(withoutToken.success, true);
});

test("accessIdLoginSchema: accepts a valid accessId-login body", () => {
  const result = accessIdLoginSchema.safeParse({ accessId: "A001", password: "hunter2" });
  assert.equal(result.success, true);
});

test("accessIdLoginSchema: rejects a missing accessId or password", () => {
  assert.equal(accessIdLoginSchema.safeParse({ password: "hunter2" }).success, false);
  assert.equal(accessIdLoginSchema.safeParse({ accessId: "A001" }).success, false);
});

test("accessIdLoginSchema: trims accessId but not password", () => {
  const result = accessIdLoginSchema.safeParse({ accessId: "  A001  ", password: "  hunter2  " });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.accessId, "A001");
    // Not trimmed: route.ts bcrypt-compares this against the stored hash raw.
    assert.equal(result.data.password, "  hunter2  ");
  }
});

test("accessIdLoginSchema: rejects a whitespace-only password", () => {
  assert.equal(accessIdLoginSchema.safeParse({ accessId: "A001", password: "   " }).success, false);
});
