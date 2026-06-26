import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";
import { CandidateStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    const candidate = await prisma.candidate.findUnique({
      where: { id: payload.candidateId },
      select: { campaignId: true },
    });
    if (!candidate?.campaignId) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { campaignId } = candidate;
    const cacheKey = `session-stats:${campaignId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json(JSON.parse(cached));

    const [campaign, total, inWaitingRoom, joined] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } }),
      prisma.candidate.count({ where: { campaignId } }),
      prisma.candidate.count({ where: { campaignId, status: CandidateStatus.JOINED } }),
      prisma.candidate.count({
        where: {
          campaignId,
          status: { in: [CandidateStatus.JOINED, CandidateStatus.ACTIVE, CandidateStatus.COMPLETED] },
        },
      }),
    ]);

    const result = { total, inWaitingRoom, joined, sessionTitle: campaign?.name ?? null };
    await redis.set(cacheKey, JSON.stringify(result), "EX", 15);

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/candidate/session-stats error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
