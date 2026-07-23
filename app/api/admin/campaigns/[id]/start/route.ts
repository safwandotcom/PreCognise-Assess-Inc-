// app/api/admin/campaigns/[id]/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { CampaignStatus } from "@prisma/client";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const delayMinutes: number = body.delayMinutes ?? 0;

    if (campaign.status === CampaignStatus.LIVE) {
      return NextResponse.json({ error: "Already live" }, { status: 409 });
    }

    const startAt = delayMinutes > 0
      ? new Date(Date.now() + delayMinutes * 60_000)
      : new Date();

    if (delayMinutes > 0) {
      const updated = await prisma.campaign.update({
        where: { id },
        data: { scheduledAt: startAt, status: CampaignStatus.SCHEDULED },
      });
      return NextResponse.json({ campaign: updated });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.LIVE, startedAt: startAt },
    });
    // Invalidate polling cache so candidates see LIVE status within their next poll cycle
    try { await redis.del(`session-stats:${id}`); } catch { /* non-fatal */ }
    return NextResponse.json({ campaign: updated });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/start error:", err);
    return NextResponse.json({ error: "Failed to start campaign" }, { status: 500 });
  }
}
