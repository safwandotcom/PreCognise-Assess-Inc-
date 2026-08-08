// app/api/admin/responses/[id]/grade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const response = await prisma.response.findUnique({
      where: { id },
      select: {
        needsGrading: true,
        question: {
          select: {
            basePoints: true,
            campaign: { select: { ownerId: true } },
          },
        },
      },
    });
    if (!response || response.question.campaign.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!response.needsGrading) {
      return NextResponse.json(
        { error: "This response does not require manual grading" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const score = Number(body.score);
    if (
      !Number.isFinite(score) ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > response.question.basePoints
    ) {
      return NextResponse.json(
        { error: `Score must be a whole number between 0 and ${response.question.basePoints}` },
        { status: 400 }
      );
    }

    const updated = await prisma.response.update({
      where: { id },
      data: { score, gradedAt: new Date() },
    });

    return NextResponse.json({ response: updated });
  } catch (err) {
    console.error("PATCH /api/admin/responses/[id]/grade error:", err);
    return NextResponse.json({ error: "Failed to save grade" }, { status: 500 });
  }
}
