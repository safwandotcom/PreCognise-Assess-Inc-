// app/api/admin/campaigns/[id]/results/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // 1. Fetch campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        name: true,
        negativeMarking: true,
        negativeMarkingValue: true,
        durationSec: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

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
        disqualifyReason: true,
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

    const scorable = new Set(["mcq", "image"]);

    const aggregated = candidates.map((c) => {
      const cResponses = responsesByCandidateId.get(c.id) ?? [];

      const rawScore = cResponses.reduce((sum, r) => sum + r.score, 0);
      const correctCount = cResponses.filter(
        (r) => r.score > 0 && scorable.has(r.question.type)
      ).length;
      const answeredCount = cResponses.length;

      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cResponses) {
          if (
            r.answer !== null &&
            r.score === 0 &&
            scorable.has(r.question.type)
          ) {
            // Wrong answer: answer !== null, score === 0
            // Verify it wasn't just unanswered (answer could be a Json value)
            // answer is Json; correctOption is Int. A null answer means skipped.
            // We check answer is not null (already done above) and score is 0
            // which means it was answered incorrectly (or was a wrong MCQ answer)
            const answerVal = r.answer;
            // Skip if answer is literally null (unanswered)
            if (answerVal === null) continue;
            // For MCQ/image: wrong means answer !== correctOption
            if (r.question.correctOption !== null && answerVal !== r.question.correctOption) {
              penalty += r.question.basePoints * campaign.negativeMarkingValue;
            }
          }
        }
      }

      const totalScore = Math.max(0, rawScore - penalty);

      return {
        id: c.id,
        accessId: c.accessId,
        name: c.name,
        email: c.email,
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        disqualifyReason: c.disqualifyReason,
        totalScore,
        rawScore,
        correctCount,
        answeredCount,
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
