import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/admin/questions/reorder
// Body: { id: string, direction: "up" | "down" }
// Swaps orderIndex of the target question with its neighbour.
export async function PATCH(req: NextRequest) {
  try {
    const { id, direction } = await req.json();
    if (!id || !direction) {
      return NextResponse.json({ error: "id and direction required" }, { status: 400 });
    }

    const target = await prisma.question.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const neighbourIndex = direction === "up" ? target.orderIndex - 1 : target.orderIndex + 1;
    const neighbour = await prisma.question.findFirst({
      where: { sessionId: target.sessionId, orderIndex: neighbourIndex },
    });

    if (!neighbour) {
      return NextResponse.json({ error: "Already at boundary" }, { status: 400 });
    }

    // Swap the two orderIndex values atomically via a transaction
    await prisma.$transaction([
      prisma.question.update({ where: { id: target.id }, data: { orderIndex: neighbourIndex } }),
      prisma.question.update({ where: { id: neighbour.id }, data: { orderIndex: target.orderIndex } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/admin/questions/reorder error:", err);
    return NextResponse.json({ error: "Failed to reorder" }, { status: 500 });
  }
}
