// app/api/admin/campaigns/[id]/end/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { CampaignStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.ENDED, endedAt: new Date() },
    });
    try { await redis.del(`session-stats:${id}`); } catch { /* non-fatal */ }
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/end error:", err);
    return NextResponse.json({ error: "Failed to end campaign" }, { status: 500 });
  }
}
