import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { type, text, imageUrl, options, correctOption, timeLimitSec, basePoints, speedBonusMax } = body;

    const question = await prisma.question.update({
      where: { id },
      data: {
        type,
        text,
        imageUrl: imageUrl || null,
        options: options ?? [],
        correctOption: correctOption ?? null,
        timeLimitSec: Number(timeLimitSec),
        basePoints: Number(basePoints),
        speedBonusMax: Number(speedBonusMax ?? 0),
      },
    });

    return NextResponse.json({ question });
  } catch (err) {
    console.error("PUT /api/admin/questions/[id] error:", err);
    return NextResponse.json({ error: "Failed to update question" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const target = await prisma.question.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.question.delete({ where: { id } });

    // Close the gap in orderIndex for questions that came after the deleted one
    await prisma.question.updateMany({
      where: { sessionId: target.sessionId, orderIndex: { gt: target.orderIndex } },
      data: { orderIndex: { decrement: 1 } },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/questions/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
  }
}
