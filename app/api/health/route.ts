import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Never statically optimize this route — a health check cached at build
// time would report "ok" forever regardless of actual runtime state.
export const dynamic = "force-dynamic";

// Redis is informational only here, not a failure condition: the rest of
// the app already treats Redis as fail-open (see lib/rate-limit.ts), so a
// down Redis shouldn't flip a load balancer's view of this instance to
// unhealthy — only a down database should.
async function checkRedis(): Promise<"ok" | "error"> {
  try {
    await redis.ping();
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("GET /api/health: database check failed:", err);
    return NextResponse.json(
      { status: "error", database: "error", redis: await checkRedis() },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "ok", database: "ok", redis: await checkRedis() });
}
