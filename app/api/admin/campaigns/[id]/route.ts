// app/api/admin/campaigns/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uniqueJoinSlug } from "@/lib/join-slug";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const owned = await ownedCampaign(id, ownerId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const existing = await ownedCampaign(id, ownerId);
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatMultiDisplay, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml, scheduledEnd, openJoinEnabled } = body;
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Campaign name cannot be empty" }, { status: 400 });
    }

    // Validate the window: scheduledEnd (if present after this update) must
    // be strictly after scheduledAt, and open-join campaigns must have a
    // scheduledEnd — there's no other sensible way to bound them.
    const effectiveScheduledAt =
      scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt;
    const effectiveScheduledEnd =
      scheduledEnd !== undefined ? (scheduledEnd ? new Date(scheduledEnd) : null) : existing.scheduledEnd;
    if (effectiveScheduledEnd && effectiveScheduledAt && effectiveScheduledEnd <= effectiveScheduledAt) {
      return NextResponse.json({ error: "End time must be after the scheduled start time" }, { status: 400 });
    }
    const effectiveOpenJoinEnabled =
      openJoinEnabled !== undefined ? openJoinEnabled : existing.openJoinEnabled;
    if (effectiveOpenJoinEnabled && !effectiveScheduledEnd) {
      return NextResponse.json({ error: "Open-join campaigns need an end time" }, { status: 400 });
    }
    // Only the transition into open-join needs this guard — once a campaign is
    // open-join-enabled, its candidates are all self-registrations (the two
    // candidate-creation routes already refuse to add anyone else), so every
    // later PATCH to the same already-enabled campaign must not re-trigger it.
    if (effectiveOpenJoinEnabled && !existing.openJoinEnabled) {
      const candidateCount = await prisma.candidate.count({ where: { campaignId: id } });
      if (candidateCount > 0) {
        return NextResponse.json(
          { error: "Can't enable open join on a campaign that already has candidates — remove them first, or use a new campaign." },
          { status: 400 }
        );
      }
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
        ...(scheduledEnd !== undefined && { scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null }),
        ...(openJoinEnabled !== undefined && { openJoinEnabled }),
        ...(disqualifyOnDuplicateLogin !== undefined && { disqualifyOnDuplicateLogin }),
        ...(antiCheatTabSwitch !== undefined && { antiCheatTabSwitch }),
        ...(tabSwitchLimit !== undefined && { tabSwitchLimit: Number(tabSwitchLimit) }),
        ...(antiCheatFullscreen !== undefined && { antiCheatFullscreen }),
        ...(antiCheatCopyPaste !== undefined && { antiCheatCopyPaste }),
        ...(antiCheatRightClick !== undefined && { antiCheatRightClick }),
        ...(antiCheatScreenshot !== undefined && { antiCheatScreenshot }),
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(antiCheatCamera !== undefined && { antiCheatCamera }),
        ...(antiCheatMultiDisplay !== undefined && { antiCheatMultiDisplay }),
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
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const existing = await ownedCampaign(id, ownerId);
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
