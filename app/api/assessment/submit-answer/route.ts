import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { calculateScore } from "@/lib/scoring";
import { AnswerPayload, QuestionType } from "@/types";

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

  const body = (await req.json()) as Partial<AnswerPayload>;
  const { questionId, value, responseTimeMs } = body;

  if (!questionId || typeof responseTimeMs !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Reject duplicate submissions — the @@unique constraint backs this up,
  // but checking first lets us return a clean 409 instead of a DB error.
  const existing = await prisma.response.findUnique({
    where: { candidateId_questionId: { candidateId, questionId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Question already answered" }, { status: 409 });
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const isCorrect = question.correctOption !== null && value === question.correctOption;

  const scoreEarned = calculateScore(
    isCorrect,
    question.type as unknown as QuestionType,
    question.basePoints,
    question.speedBonusMax,
    responseTimeMs,
    question.timeLimitSec
  );

  await prisma.response.create({
    data: {
      candidateId,
      questionId,
      // value is null on a skipped/timed-out question — Prisma needs
      // Prisma.JsonNull, not JS null, to store that in a required Json field
      answer: value === null || value === undefined ? Prisma.JsonNull : value,
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