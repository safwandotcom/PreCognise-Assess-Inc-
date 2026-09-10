import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { parseBody, nonBlankString } from "./validate-body";

function fakeRequest(body: unknown, { invalidJson = false } = {}): NextRequest {
  return {
    json: async () => {
      if (invalidJson) throw new SyntaxError("Unexpected token");
      return body;
    },
  } as unknown as NextRequest;
}

const schema = z.object({ name: z.string().min(1) });

test("parseBody: a valid body returns the typed, parsed data", async () => {
  const result = await parseBody(schema, fakeRequest({ name: "Ada" }), "bad");
  assert.ok("data" in result);
  if ("data" in result) assert.equal(result.data.name, "Ada");
});

test("parseBody: a schema violation returns a 400 carrying the given message", async () => {
  const result = await parseBody(schema, fakeRequest({ name: "" }), "Name is required");
  assert.ok("error" in result);
  if ("error" in result) {
    assert.equal(result.error.status, 400);
    const body = await result.error.json();
    assert.equal(body.error, "Name is required");
  }
});

test("parseBody: an unparseable JSON body also returns a 400 with the given message", async () => {
  const result = await parseBody(schema, fakeRequest(null, { invalidJson: true }), "Bad JSON");
  assert.ok("error" in result);
  if ("error" in result) {
    assert.equal(result.error.status, 400);
    const body = await result.error.json();
    assert.equal(body.error, "Bad JSON");
  }
});

test("nonBlankString: rejects empty and whitespace-only strings", () => {
  assert.equal(nonBlankString.safeParse("").success, false);
  assert.equal(nonBlankString.safeParse("   ").success, false);
  assert.equal(nonBlankString.safeParse(" ok ").success, true);
});

test("nonBlankString: preserves the original value verbatim — it does not trim", () => {
  const result = nonBlankString.safeParse("  raw value  ");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data, "  raw value  ");
});
