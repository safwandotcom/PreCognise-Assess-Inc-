import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { calculateScore } from "@/lib/scoring";
import { getSettings } from "@/lib/get-settings";
import { AnswerPayload, QuestionType } from "@/types";
import { translateDisplayIndexToCanonical } from "@/lib/shuffle";

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function POST(req: NextRequest) {
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
    select: { status: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status === "DISQUALIFIED") {
    return NextResponse.json(
      { error: "You have been disqualified from this assessment" },
      { status: 403 }
    );
  }

  const body = (await req.json()) as Partial<AnswerPayload>;
  const { questionId, value, responseTimeMs } = body;

  if (!questionId || typeof responseTimeMs !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Double-answer guard — @@unique constraint also backs this up
  const existing = await prisma.response.findUnique({
    where: { candidateId_questionId: { candidateId, questionId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Question already answered" }, { status: 409 });
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { campaign: { select: { antiCheatShuffleAnswers: true } } },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  // Respect global speed bonus toggle
  const settings = await getSettings();
  const effectiveSpeedBonusMax = settings.speedBonusEnabled ? question.speedBonusMax : 0;

  // If answer-shuffling is on for this campaign, `value` is the index the
  // candidate clicked in *their* shuffled view — translate it back to the
  // canonical index stored in `question.correctOption` before scoring, and
  // before persisting, so analytics stay meaningful regardless of shuffling.
  const shouldUnshuffle =
    question.campaign.antiCheatShuffleAnswers &&
    (question.type === "mcq" || question.type === "image");

  const canonicalValue =
    shouldUnshuffle && typeof value === "number"
      ? translateDisplayIndexToCanonical(
          value,
          (question.options as unknown[]).length,
          `${candidateId}:${questionId}`,
        )
      : value;

  const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
  const scoreEarned = calculateScore(
    isCorrect,
    question.type as unknown as QuestionType,
    question.basePoints,
    effectiveSpeedBonusMax,
    responseTimeMs,
    question.timeLimitSec
  );

  await prisma.response.create({
    data: {
      candidateId,
      questionId,
      answer: canonicalValue === null || canonicalValue === undefined ? Prisma.JsonNull : canonicalValue,
      score: scoreEarned,
      responseTimeMs,
    },
  });

  const totals = await prisma.response.aggregate({
    where: { candidateId },
    _sum: { score: true },
  });

  return NextResponse.json({
    scoreEarned,
    runningTotal: totals._sum.score ?? 0,
  });
}
