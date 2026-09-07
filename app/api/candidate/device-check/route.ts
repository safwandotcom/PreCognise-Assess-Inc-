import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

// Pre-waiting-room device/permission check (task #26). Deliberately separate
// from /api/candidate/acknowledge (instructions page, "I read the rules and
// will behave honestly", captured later) — monitoringConsentedAt is
// specifically "I agreed to be monitored", captured at the moment
// camera/fullscreen/single-display access was actually confirmed live, and
// is the documented proof of consent this task exists for.

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
            antiCheatCamera: true,
            antiCheatFullscreen: true,
            antiCheatMultiDisplay: true,
          },
        },
      },
    });

    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      alreadyConsented: !!candidate.monitoringConsentedAt,
      antiCheat: {
        camera: candidate.campaign.antiCheatCamera,
        fullscreen: candidate.campaign.antiCheatFullscreen,
        multiDisplay: candidate.campaign.antiCheatMultiDisplay,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);

    await prisma.candidate.update({
      where: { id: payload.candidateId },
      data: { monitoringConsentedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
