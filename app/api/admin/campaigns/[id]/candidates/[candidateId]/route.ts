// app/api/admin/campaigns/[id]/candidates/[candidateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; candidateId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, candidateId } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { campaignId: true },
  });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (candidate.campaignId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.candidate.delete({ where: { id: candidateId } });
  return NextResponse.json({ ok: true });
}
