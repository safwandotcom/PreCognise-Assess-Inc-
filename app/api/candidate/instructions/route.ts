import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: payload.candidateId },
      include: {
        campaign: {
          select: {
            name: true,
            durationSec: true,
            instructionsHtml: true,
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });

    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      alreadyAcknowledged: !!candidate.acknowledgedAt,
      candidateName: candidate.name,
      campaign: {
        name: candidate.campaign.name,
        durationSec: candidate.campaign.durationSec,
        questionCount: candidate.campaign._count.questions,
        instructionsHtml: candidate.campaign.instructionsHtml,
        antiCheat: {
          tabSwitch: candidate.campaign.antiCheatTabSwitch,
          tabSwitchLimit: candidate.campaign.tabSwitchLimit,
          fullscreen: candidate.campaign.antiCheatFullscreen,
          copyPaste: candidate.campaign.antiCheatCopyPaste,
          rightClick: candidate.campaign.antiCheatRightClick,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}