// app/api/admin/campaigns/[id]/pause/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: CampaignStatus.PAUSED },
  });
  return NextResponse.json({ campaign });
}
