import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { campaignId } = verifyToken(token);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { lastBroadcast: true, lastBroadcastAt: true },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      message: campaign.lastBroadcast,
      sentAt: campaign.lastBroadcastAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("GET /api/candidate/broadcast error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
