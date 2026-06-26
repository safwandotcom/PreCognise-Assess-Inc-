// app/api/admin/campaigns/[id]/pause/route.ts
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
      data: { status: CampaignStatus.PAUSED },
    });
    try { await redis.del(`session-stats:${id}`); } catch { /* non-fatal */ }
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/pause error:", err);
    return NextResponse.json({ error: "Failed to pause campaign" }, { status: 500 });
  }
}
