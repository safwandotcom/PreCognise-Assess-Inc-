// app/api/candidate/session-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyToken(token);
    const candidate = await prisma.candidate.findUnique({
      where: { id: payload.candidateId },
      select: { sessionId: true },
    });
    if (!candidate?.sessionId) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const sessionId = candidate.sessionId;

    const [session, total, inWaitingRoom, joined] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId }, select: { title: true } }),
      prisma.candidate.count({ where: { sessionId } }),
      prisma.candidate.count({ where: { sessionId, status: CandidateStatus.JOINED } }),
      prisma.candidate.count({
        where: {
          sessionId,
          status: { in: [CandidateStatus.JOINED, CandidateStatus.ACTIVE, CandidateStatus.COMPLETED] },
        },
      }),
    ]);

    return NextResponse.json({ total, inWaitingRoom, joined, sessionTitle: session?.title ?? null });
  } catch (err) {
    console.error("GET /api/candidate/session-stats error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
