// app/api/admin/campaigns/[id]/results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";
import { isOptionBasedQuestionType } from "@/types";
import { applyNegativeMarking } from "@/lib/scoring";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2. Fetch all questions for the campaign
    const questions = await prisma.question.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        type: true,
        basePoints: true,
        speedBonusMax: true,
        orderIndex: true,
      },
    });

    // 3. Compute max possible score and total questions
    const maxPossibleScore = questions.reduce(
      (sum, q) => sum + q.basePoints + q.speedBonusMax,
      0
    );
    const totalQuestions = questions.length;

    // 4. Fetch all responses for all candidates in this campaign
    const responses = await prisma.response.findMany({
      where: { candidate: { campaignId: id } },
      select: {
        candidateId: true,
        score: true,
        answer: true,
        needsGrading: true,
        gradedAt: true,
        question: {
          select: {
            type: true,
            correctOption: true,
            basePoints: true,
          },
        },
      },
    });

    // 5. Fetch all candidates for this campaign
    const candidates = await prisma.candidate.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        accessId: true,
        name: true,
        email: true,
        status: true,
        tabSwitchCount: true,
        multiDisplayViolationCount: true,
        disqualifyReason: true,
        fullscreenUnsupported: true,
      },
    });

    // 6. Aggregate per-candidate scores
    // Group responses by candidateId
    const responsesByCandidateId = new Map<
      string,
      typeof responses
    >();
    for (const r of responses) {
      const list = responsesByCandidateId.get(r.candidateId) ?? [];
      list.push(r);
      responsesByCandidateId.set(r.candidateId, list);
    }

    const aggregated = candidates.map((c) => {
      const cResponses = responsesByCandidateId.get(c.id) ?? [];

      const rawScore = cResponses.reduce((sum, r) => sum + r.score, 0);
      const correctCount = cResponses.filter(
        (r) => r.score > 0 && isOptionBasedQuestionType(r.question.type)
      ).length;
      const answeredCount = cResponses.length;
      const pendingReview = cResponses.some((r) => r.needsGrading && !r.gradedAt);

      // score === 0 on an auto-scored, option-based type that wasn't
      // skipped (answer !== null) already fully means "answered wrong" —
      // this doesn't need to re-derive "wrong" by comparing against
      // correctOption, which only exists for single-answer types and is
      // always null for multi_select (whose answer key lives in
      // correctOptions instead). Re-deriving it here previously meant
      // negative marking silently never applied to a wrong multi-select
      // answer — now shared via lib/scoring.ts with the score and results
      // routes instead of three separately-drifting copies of this formula.
      const wrongAnswerBasePoints = campaign.negativeMarking
        ? cResponses
            .filter((r) => r.answer !== null && r.score === 0 && isOptionBasedQuestionType(r.question.type))
            .map((r) => r.question.basePoints)
        : [];
      const totalScore = applyNegativeMarking(rawScore, wrongAnswerBasePoints, campaign.negativeMarkingValue);

      return {
        id: c.id,
        accessId: c.accessId,
        name: c.name,
        email: c.email,
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        multiDisplayViolationCount: c.multiDisplayViolationCount,
        disqualifyReason: c.disqualifyReason,
        fullscreenUnsupported: c.fullscreenUnsupported,
        totalScore,
        rawScore,
        correctCount,
        answeredCount,
        pendingReview,
      };
    });

    // 7. Sort by totalScore descending, assign rank (tied scores = same rank)
    aggregated.sort((a, b) => b.totalScore - a.totalScore);

    let rank = 1;
    const ranked = aggregated.map((c, i) => {
      if (i > 0 && c.totalScore < aggregated[i - 1].totalScore) {
        rank = i + 1;
      }
      return { rank, ...c };
    });

    return NextResponse.json({
      campaign: {
        name: campaign.name,
        negativeMarking: campaign.negativeMarking,
        durationSec: campaign.durationSec,
      },
      totalQuestions,
      maxPossibleScore,
      candidates: ranked,
    });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id]/results error:", err);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}
