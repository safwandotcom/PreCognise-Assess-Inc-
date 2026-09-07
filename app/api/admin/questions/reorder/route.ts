// app/api/admin/questions/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";
import { canEditQuestions } from "@/lib/campaign-utils";

export async function POST(req: NextRequest) {
  const { questionId, newIndex } = await req.json();
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await prisma.question.findUnique({
    where: { id: questionId },
    select: { campaignId: true, orderIndex: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const campaign = await ownedCampaign(target.campaignId, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditQuestions(campaign.status)) {
    return NextResponse.json(
      { error: "Questions cannot be reordered once a campaign has gone live." },
      { status: 403 }
    );
  }
  const campaignId = target.campaignId;

  const questions = await prisma.question.findMany({
    where: { campaignId },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });

  const ids = questions.map(q => q.id).filter(id => id !== questionId);
  ids.splice(newIndex, 0, questionId);

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.question.update({ where: { id, campaignId }, data: { orderIndex: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
