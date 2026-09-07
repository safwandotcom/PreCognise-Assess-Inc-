import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { redis } from "@/lib/redis";

// Disqualifies on the first detected extra display, when the campaign has
// autoDisqualifyOnViolation on — matching task #25 ("disqualify the moment
// a second display appears, at any point"), not a tolerance/limit like
// tabSwitchLimit. There is no separate multi-display limit setting; the
// existing autoDisqualifyOnViolation toggle is what switches this between
// disqualifying and flag-only mode, same as every other violation type.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    // Client already de-dupes via multiDisplayReportedRef; this is a
    // server-side backstop against request/DB-write spam regardless.
    const limit = await checkRateLimit(redis, `multi-display-violation:${candidateId}`, 20, 60);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        multiDisplayViolationCount: true,
        disqualifyReason: true,
        campaign: { select: { autoDisqualifyOnViolation: true } },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newCount = candidate.multiDisplayViolationCount + 1;

    if (candidate.campaign.autoDisqualifyOnViolation) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          multiDisplayViolationCount: newCount,
          status: CandidateStatus.DISQUALIFIED,
          disqualifyReason: "Disqualified: an additional display was detected during the assessment.",
          activeToken: null,
        },
      });
      return NextResponse.json({ count: newCount, disqualified: true });
    }

    // Flag-only mode: record the reason, leave status/activeToken alone —
    // the candidate continues uninterrupted, same pattern as tab-switch and
    // camera-violation's flag-only path.
    const reasonLine = "Flagged: an additional display was detected during the assessment.";
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        multiDisplayViolationCount: newCount,
        disqualifyReason:
          candidate.disqualifyReason?.includes(reasonLine)
            ? candidate.disqualifyReason
            : candidate.disqualifyReason
              ? `${candidate.disqualifyReason}\n${reasonLine}`
              : reasonLine,
      },
    });
    return NextResponse.json({ count: newCount, disqualified: false });
  } catch (err) {
    console.error("POST /api/candidate/multi-display-violation error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
