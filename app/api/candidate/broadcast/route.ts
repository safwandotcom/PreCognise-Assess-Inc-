import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { campaignId } = verifyToken(token);

    const cacheKey = `broadcast:${campaignId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return NextResponse.json(JSON.parse(cached));
    } catch { /* Redis unavailable — fall through to DB */ }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { lastBroadcast: true, lastBroadcastAt: true },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payload = {
      message: campaign.lastBroadcast,
      sentAt: campaign.lastBroadcastAt?.toISOString() ?? null,
    };
    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 15);
    } catch { /* Redis unavailable — serve uncached */ }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/candidate/broadcast error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
