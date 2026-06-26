import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var redis: IORedis | undefined;
}

export const redis =
  global.redis ?? new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

if (process.env.NODE_ENV !== "production") global.redis = redis;
