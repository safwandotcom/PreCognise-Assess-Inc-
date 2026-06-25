import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        tabSwitchCount: true,
        campaign: {
          select: {
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
          },
        },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...candidate.campaign,
      antiCheatContextMenu: candidate.campaign?.antiCheatRightClick ?? true,
      tabSwitchCount: candidate.tabSwitchCount,
    });
  } catch (err) {
    console.error("GET /api/candidate/campaign-config error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
