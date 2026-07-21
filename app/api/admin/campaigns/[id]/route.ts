// app/api/admin/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uniqueJoinSlug } from "@/lib/join-slug";

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
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Campaign name cannot be empty" }, { status: 400 });
    }
    // Regenerate the join slug only when a DRAFT campaign is renamed — never for a
    // live/ended campaign, whose join link may already have been distributed.
    let joinTokenUpdate: { joinToken?: string } = {};
    if (
      name !== undefined &&
      name.trim() !== existing.name &&
      existing.status === "DRAFT"
    ) {
      joinTokenUpdate = { joinToken: await uniqueJoinSlug(name.trim(), prisma) };
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...joinTokenUpdate,
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
        ...(antiCheatTabSwitch !== undefined && { antiCheatTabSwitch }),
        ...(tabSwitchLimit !== undefined && { tabSwitchLimit: Number(tabSwitchLimit) }),
        ...(antiCheatFullscreen !== undefined && { antiCheatFullscreen }),
        ...(antiCheatCopyPaste !== undefined && { antiCheatCopyPaste }),
        ...(antiCheatRightClick !== undefined && { antiCheatRightClick }),
        ...(antiCheatScreenshot !== undefined && { antiCheatScreenshot }),
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
        ...(antiCheatShuffleAnswers !== undefined && { antiCheatShuffleAnswers }),
        ...(completionMessage !== undefined && { completionMessage: completionMessage?.trim() || null }),
        ...(instructionsHtml !== undefined && { instructionsHtml: instructionsHtml?.trim() || null }),
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
