import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";

// Fixed at 3 by product decision — independent of the admin-configurable
// tabSwitchLimit, and active whenever antiCheatCamera is on regardless of
// the antiCheatTabSwitch toggle.
const CAMERA_VIOLATION_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

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
