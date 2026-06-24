// app/api/admin/campaigns/[id]/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const delayMinutes: number = body.delayMinutes ?? 0;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json({ campaign: updated });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/start error:", err);
    return NextResponse.json({ error: "Failed to start campaign" }, { status: 500 });
  }
}
