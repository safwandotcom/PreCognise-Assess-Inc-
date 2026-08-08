// app/api/admin/campaigns/[id]/results/[candidateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; candidateId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id, candidateId } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, campaignId: id },
      select: { id: true, name: true, email: true, accessId: true, status: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const questions = await prisma.question.findMany({
      where: { campaignId: id },
      orderBy: { orderIndex: "asc" },
      select: { id: true, type: true, text: true, basePoints: true, wordLimit: true },
    });

    const responses = await prisma.response.findMany({
      where: { candidateId },
      select: {
        id: true,
        questionId: true,
        answer: true,
        score: true,
        needsGrading: true,
        gradedAt: true,
      },
    });
    const responseByQuestionId = new Map(responses.map((r) => [r.questionId, r]));

    const items = questions.map((q) => ({
      questionId: q.id,
      type: q.type,
      text: q.text,
      basePoints: q.basePoints,
      wordLimit: q.wordLimit,
      response: responseByQuestionId.get(q.id) ?? null,
    }));

    return NextResponse.json({ candidate, items });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id]/results/[candidateId] error:", err);
    return NextResponse.json({ error: "Failed to fetch candidate detail" }, { status: 500 });
  }
}
