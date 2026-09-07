import { test } from "node:test";
import assert from "node:assert/strict";
import IORedisMock from "ioredis-mock";
import { checkRateLimit } from "./rate-limit";

test("checkRateLimit: allows requests under the limit", async () => {
  const redis = new IORedisMock();
  const result = await checkRateLimit(redis, "test:a", 3, 60);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
});

test("checkRateLimit: blocks once the limit is exceeded", async () => {
  const redis = new IORedisMock();
  await checkRateLimit(redis, "test:b", 2, 60);
  await checkRateLimit(redis, "test:b", 2, 60);
  const third = await checkRateLimit(redis, "test:b", 2, 60);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test("checkRateLimit: different keys are tracked independently", async () => {
  const redis = new IORedisMock();
  await checkRateLimit(redis, "test:c1", 1, 60);
  const other = await checkRateLimit(redis, "test:c2", 1, 60);
  assert.equal(other.allowed, true);
});

test("checkRateLimit: resets once the window expires", async () => {
  const redis = new IORedisMock();
  await checkRateLimit(redis, "test:d", 1, 1); // 1-second window
  const blocked = await checkRateLimit(redis, "test:d", 1, 1);
  assert.equal(blocked.allowed, false);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const afterExpiry = await checkRateLimit(redis, "test:d", 1, 1);
  assert.equal(afterExpiry.allowed, true);
});

test("checkRateLimit: fails open when the Redis call throws", async () => {
  const brokenRedis = {
    incr: async () => { throw new Error("connection refused"); },
    expire: async () => { throw new Error("connection refused"); },
  };
  const result = await checkRateLimit(brokenRedis, "test:e", 1, 60);
  assert.equal(result.allowed, true);
});
