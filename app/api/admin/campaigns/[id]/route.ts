// app/api/admin/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { candidates: true, questions: true } },
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin } = body;
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Campaign name cannot be empty" }, { status: 400 });
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(autoStart !== undefined && { autoStart }),
        ...(maxCandidates !== undefined && { maxCandidates }),
        ...(negativeMarking !== undefined && { negativeMarking }),
        ...(negativeMarkingValue !== undefined && { negativeMarkingValue }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl?.trim() || null }),
        ...(bgColor !== undefined && { bgColor: bgColor?.trim() || "#F8FAFC" }),
        ...(gracePeriodMin !== undefined && { gracePeriodMin: Number(gracePeriodMin) }),
        ...(disqualifyOnDuplicateLogin !== undefined && { disqualifyOnDuplicateLogin }),
      },
    });
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("PATCH /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
