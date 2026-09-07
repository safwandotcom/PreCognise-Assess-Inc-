import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

// Fixed at 3 by product decision — independent of the admin-configurable
// tabSwitchLimit, and active whenever antiCheatCamera is on regardless of
// the antiCheatTabSwitch toggle.
const CAMERA_VIOLATION_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    // Not really a brute-force target (already gated behind a valid
    // candidate JWT) — this just bounds request/DB-write spam, including
    // from a candidate whose JWT is still technically valid after they've
    // already been disqualified.
    const limit = await checkRateLimit(redis, `camera-violation:${candidateId}`, 20, 60);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        cameraViolationCount: true,
        disqualifyReason: true,
        campaign: { select: { autoDisqualifyOnViolation: true } },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newCount = candidate.cameraViolationCount + 1;
    const exceeded = newCount >= CAMERA_VIOLATION_LIMIT;

    if (exceeded) {
      const reasonLine = `Flagged: camera/microphone access denied ${CAMERA_VIOLATION_LIMIT} times.`;
      if (candidate.campaign.autoDisqualifyOnViolation) {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: {
            cameraViolationCount: newCount,
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: `Disqualified: camera/microphone access denied ${CAMERA_VIOLATION_LIMIT} times.`,
            activeToken: null,
          },
        });
        return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: true });
      }
      // Flag-only mode: record the reason, leave status/activeToken alone.
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          cameraViolationCount: newCount,
          disqualifyReason:
            candidate.disqualifyReason?.includes(reasonLine)
              ? candidate.disqualifyReason
              : candidate.disqualifyReason
                ? `${candidate.disqualifyReason}\n${reasonLine}`
                : reasonLine,
        },
      });
      return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: false });
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { cameraViolationCount: newCount },
    });
    return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: false });
  } catch (err) {
    console.error("POST /api/candidate/camera-violation error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
