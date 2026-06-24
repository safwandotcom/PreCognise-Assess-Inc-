import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveSessionId(sessionId?: string | null): Promise<string | null> {
  if (sessionId) return sessionId;
  const session = await prisma.session.findFirst({ orderBy: { createdAt: "desc" } });
  return session?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sid = await resolveSessionId(searchParams.get("sessionId"));
    if (!sid) return NextResponse.json({ questions: [] });

    const questions = await prisma.question.findMany({
      where: { sessionId: sid },
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("GET /api/admin/questions error:", err);
    return NextResponse.json({ error: "Failed to load questions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId: bodySessionId, type, text, imageUrl, options, correctOption, timeLimitSec, basePoints, speedBonusMax } = body;

    if (!type || !text || !timeLimitSec || basePoints == null) {
      return NextResponse.json({ error: "type, text, timeLimitSec, basePoints are required" }, { status: 400 });
    }

    const sid = await resolveSessionId(bodySessionId);
    if (!sid) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    const lastQuestion = await prisma.question.findFirst({
      where: { sessionId: sid },
      orderBy: { orderIndex: "desc" },
    });
    const nextIndex = lastQuestion ? lastQuestion.orderIndex + 1 : 0;

    const question = await prisma.question.create({
      data: {
        sessionId: sid,
        type,
        text,
        imageUrl: imageUrl || null,
        options: options ?? [],
        correctOption: correctOption ?? null,
        timeLimitSec: Number(timeLimitSec),
        basePoints: Number(basePoints),
        speedBonusMax: Number(speedBonusMax ?? 0),
        orderIndex: nextIndex,
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/questions error:", err);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}
