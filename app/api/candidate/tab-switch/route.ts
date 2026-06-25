import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { campaign: { select: { antiCheatTabSwitch: true, tabSwitchLimit: true } } },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Feature disabled for this campaign
    if (!candidate.campaign.antiCheatTabSwitch) {
      return NextResponse.json({ count: candidate.tabSwitchCount, limit: 0, disqualified: false });
    }

    const newCount = candidate.tabSwitchCount + 1;
    const limit = candidate.campaign.tabSwitchLimit;
    const exceeded = limit > 0 && newCount > limit;

    if (exceeded) {
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          tabSwitchCount: newCount,
          status: CandidateStatus.DISQUALIFIED,
          disqualifyReason: `Disqualified: exceeded tab switch limit (${limit} allowed).`,
          activeToken: null,
        },
      });
      return NextResponse.json({ count: newCount, limit, disqualified: true });
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { tabSwitchCount: newCount },
    });
    return NextResponse.json({ count: newCount, limit, disqualified: false });
  } catch (err) {
    console.error("POST /api/candidate/tab-switch error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
