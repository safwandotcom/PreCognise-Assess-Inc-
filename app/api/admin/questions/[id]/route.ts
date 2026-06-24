// app/api/admin/questions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.question.findUnique({ where: { id }, select: { campaignId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const question = await prisma.question.update({
    where: { id },
    data: {
      ...(body.type !== undefined && { type: body.type }),
      ...(body.text !== undefined && { text: body.text }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.options !== undefined && { options: body.options }),
      ...(body.correctOption !== undefined && { correctOption: body.correctOption }),
      ...(body.timeLimitSec !== undefined && { timeLimitSec: body.timeLimitSec }),
      ...(body.basePoints !== undefined && { basePoints: body.basePoints }),
      ...(body.speedBonusMax !== undefined && { speedBonusMax: body.speedBonusMax }),
    },
  });
  await syncDuration(existing.campaignId);
  return NextResponse.json({ question });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id }, select: { campaignId: true } });
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.question.delete({ where: { id } });
  await syncDuration(question.campaignId);
  return NextResponse.json({ ok: true });
}
