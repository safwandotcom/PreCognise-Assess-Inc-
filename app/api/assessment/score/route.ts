import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function isScoredType(type: string): boolean {
  return type === "mcq" || type === "image";
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  let candidateId: string;
  try {
    candidateId = verifyToken(token).candidateId;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { sessionId: true, status: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  if (candidate.status === "DISQUALIFIED") {
    return NextResponse.json({ error: "You have been disqualified" }, { status: 403 });
  }

  // Fetch all questions in this session (ordered) and this candidate's responses
  const [allQuestions, responses] = await Promise.all([
    prisma.question.findMany({
      where: { sessionId: candidate.sessionId },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        type: true,
        text: true,
        basePoints: true,
        speedBonusMax: true,
        timeLimitSec: true,
        orderIndex: true,
      },
    }),
    prisma.response.findMany({
      where: { candidateId },
      select: {
        score: true,
        responseTimeMs: true,
        question: {
          select: {
            id: true,
            type: true,
            basePoints: true,
          },
        },
      },
    }),
  ]);

  // ── Aggregate totals ────────────────────────────────────────────────────────

  const totalScore = responses.reduce((sum, r) => sum + r.score, 0);
  const questionsAnswered = responses.length;

  const speedBonusTotal = responses.reduce((sum, r) => {
    if (!isScoredType(r.question.type)) return sum;
    const bonus = r.score - r.question.basePoints;
    return sum + (bonus > 0 ? bonus : 0);
  }, 0);

  const baseScoreTotal = totalScore - speedBonusTotal;

  const questionsCorrect = responses.filter(
    (r) => isScoredType(r.question.type) && r.score > 0
  ).length;

  const totalScoredQuestions = allQuestions.filter((q) => isScoredType(q.type)).length;

  const maxPossibleScore = allQuestions.reduce(
    (sum, q) => sum + q.basePoints + (isScoredType(q.type) ? q.speedBonusMax : 0),
    0
  );

  const maxBaseScore = allQuestions.reduce((sum, q) => sum + q.basePoints, 0);
  const maxSpeedBonus = maxPossibleScore - maxBaseScore;

  // ── Percentile rank ────────────────────────────────────────────────────────
  // Group responses by completed peers (excluding this candidate) and sum scores.
  const peerAggregates = await prisma.response.groupBy({
    by: ["candidateId"],
    where: {
      candidate: {
        sessionId: candidate.sessionId,
        status: "COMPLETED",
        NOT: { id: candidateId },
      },
    },
    _sum: { score: true },
  });

  const peerScores = peerAggregates.map((p) => p._sum.score ?? 0);
  const peersCompleted = peerScores.length;
  const scoredBelow = peerScores.filter((s) => s < totalScore).length;
  const percentileRank =
    peersCompleted >= 1 ? Math.round((scoredBelow / peersCompleted) * 100) : null;

  // ── Per-question breakdown ─────────────────────────────────────────────────

  const responseByQuestionId = new Map(
    responses.map((r) => [r.question.id, r])
  );

  const breakdown = allQuestions.map((q) => {
    const response = responseByQuestionId.get(q.id);
    const scorable = isScoredType(q.type);

    if (!response) {
      return {
        questionId: q.id,
        questionText: q.text,
        questionType: q.type,
        orderIndex: q.orderIndex,
        basePoints: q.basePoints,
        speedBonusMax: q.speedBonusMax,
        timeLimitSec: q.timeLimitSec,
        answered: false,
        correct: null as boolean | null,
        score: 0,
        baseAwarded: 0,
        speedBonusAwarded: 0,
        responseTimeMs: 0,
      };
    }

    const correct = scorable ? response.score > 0 : null;
    const baseAwarded = scorable
      ? response.score > 0
        ? q.basePoints
        : 0
      : response.score; // psychometric / rating always award basePoints
    const speedBonusAwarded = Math.max(0, response.score - baseAwarded);

    return {
      questionId: q.id,
      questionText: q.text,
      questionType: q.type,
      orderIndex: q.orderIndex,
      basePoints: q.basePoints,
      speedBonusMax: q.speedBonusMax,
      timeLimitSec: q.timeLimitSec,
      answered: true,
      correct,
      score: response.score,
      baseAwarded,
      speedBonusAwarded,
      responseTimeMs: response.responseTimeMs,
    };
  });

  return NextResponse.json({
    totalScore,
    questionsAnswered,
    questionsCorrect,
    totalQuestions: allQuestions.length,
    totalScoredQuestions,
    speedBonusTotal,
    baseScoreTotal,
    maxPossibleScore,
    maxBaseScore,
    maxSpeedBonus,
    percentileRank,
    peersCompleted,
    breakdown,
  });
}
