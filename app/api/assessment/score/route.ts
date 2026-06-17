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
    select: { sessionId: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const responses = await prisma.response.findMany({
    where: { candidateId },
    select: {
      score: true,
      question: { select: { type: true, basePoints: true } },
    },
  });

  const totalScore = responses.reduce((sum, r) => sum + r.score, 0);
  const questionsAnswered = responses.length;

  const speedBonusTotal = responses.reduce((sum, r) => {
    const bonus = isScoredType(r.question.type) ? r.score - r.question.basePoints : 0;
    return sum + (bonus > 0 ? bonus : 0);
  }, 0);

  const questionsCorrect = responses.filter(
    (r) => isScoredType(r.question.type) && r.score > 0
  ).length;

  // Every question correct + every speed bonus maxed — used to turn the
  // result page's ring into an actual percentage rather than a raw number.
  const allQuestions = await prisma.question.findMany({
    where: { sessionId: candidate.sessionId },
    select: { basePoints: true, speedBonusMax: true, type: true },
  });
  const maxPossibleScore = allQuestions.reduce(
    (sum, q) => sum + q.basePoints + (isScoredType(q.type) ? q.speedBonusMax : 0),
    0
  );

  return NextResponse.json({
    totalScore,
    questionsAnswered,
    questionsCorrect,
    speedBonusTotal,
    maxPossibleScore,
  });
}