// app/api/admin/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: { select: { candidates: true, questions: true } },
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor } = body;
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(autoStart !== undefined && { autoStart }),
      ...(maxCandidates !== undefined && { maxCandidates }),
      ...(negativeMarking !== undefined && { negativeMarking }),
      ...(negativeMarkingValue !== undefined && { negativeMarkingValue }),
      ...(logoUrl !== undefined && { logoUrl: logoUrl?.trim() || null }),
      ...(bgColor !== undefined && { bgColor: bgColor?.trim() || "#F8FAFC" }),
    },
  });
  return NextResponse.json({ campaign });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
