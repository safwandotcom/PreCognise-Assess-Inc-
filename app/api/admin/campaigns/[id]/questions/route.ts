// app/api/admin/campaigns/[id]/questions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

async function syncDuration(campaignId: string) {
  const agg = await prisma.question.aggregate({
    where: { campaignId },
    _sum: { timeLimitSec: true },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { durationSec: agg._sum.timeLimitSec ?? 0 },
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const questions = await prisma.question.findMany({
    where: { campaignId: id },
    orderBy: { orderIndex: "asc" },
  });
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const { type, text, imageUrl, options, correctOption, timeLimitSec, basePoints, speedBonusMax } = body;

  const count = await prisma.question.count({ where: { campaignId: id } });
  const question = await prisma.question.create({
    data: {
      type,
      text,
      imageUrl: imageUrl ?? null,
      options,
      correctOption: correctOption ?? null,
      timeLimitSec,
      basePoints,
      speedBonusMax: speedBonusMax ?? 0,
      orderIndex: count,
      campaignId: id,
    },
  });
  await syncDuration(id);
  return NextResponse.json({ question }, { status: 201 });
}
