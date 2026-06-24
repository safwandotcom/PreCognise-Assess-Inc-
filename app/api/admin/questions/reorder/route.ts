// app/api/admin/questions/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { questionId, newIndex } = await req.json();
  const target = await prisma.question.findUnique({
    where: { id: questionId },
    select: { campaignId: true, orderIndex: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const questions = await prisma.question.findMany({
    where: { campaignId: target.campaignId },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });

  const ids = questions.map(q => q.id).filter(id => id !== questionId);
  ids.splice(newIndex, 0, questionId);

  await prisma.$transaction(
    ids.map((id, index) => prisma.question.update({ where: { id }, data: { orderIndex: index } }))
  );

  return NextResponse.json({ ok: true });
}
