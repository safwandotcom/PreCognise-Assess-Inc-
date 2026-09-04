// app/api/admin/campaigns/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uniqueJoinSlug } from "@/lib/join-slug";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const source = await ownedCampaign(id, ownerId);
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const questions = await prisma.question.findMany({
      where: { campaignId: id },
      orderBy: { orderIndex: "asc" },
    });

    const campaign = await prisma.$transaction(async (tx) => {
      const joinToken = await uniqueJoinSlug(`${source.name} copy`, tx);

      const created = await tx.campaign.create({
        data: {
          ownerId: source.ownerId,
          name: `${source.name} (Copy)`,
          joinToken,
          // Scheduling and live-session state resets — this is a fresh draft,
          // not a continuation of the source campaign's run.
          status: "DRAFT",
          scheduledAt: null,
          startedAt: null,
          endedAt: null,
          scheduledEnd: null,
          // openJoinEnabled requires scheduledEnd to be set (enforced on the
          // update path); since scheduledEnd resets above, this must reset
          // too rather than create a campaign that already violates that rule.
          openJoinEnabled: false,
          lastBroadcast: null,
          lastBroadcastAt: null,
          // Settings carried over verbatim.
          autoStart: source.autoStart,
          durationSec: source.durationSec,
          logoUrl: source.logoUrl,
          bgColor: source.bgColor,
          maxCandidates: source.maxCandidates,
          negativeMarking: source.negativeMarking,
          negativeMarkingValue: source.negativeMarkingValue,
          gracePeriodMin: source.gracePeriodMin,
          disqualifyOnDuplicateLogin: source.disqualifyOnDuplicateLogin,
          antiCheatTabSwitch: source.antiCheatTabSwitch,
          tabSwitchLimit: source.tabSwitchLimit,
          antiCheatFullscreen: source.antiCheatFullscreen,
          antiCheatCopyPaste: source.antiCheatCopyPaste,
          antiCheatRightClick: source.antiCheatRightClick,
          antiCheatScreenshot: source.antiCheatScreenshot,
          antiCheatDevTools: source.antiCheatDevTools,
          antiCheatCamera: source.antiCheatCamera,
          antiCheatMultiDisplay: source.antiCheatMultiDisplay,
          antiCheatShuffleQuestions: source.antiCheatShuffleQuestions,
          antiCheatShuffleAnswers: source.antiCheatShuffleAnswers,
          completionMessage: source.completionMessage,
          instructionsHtml: source.instructionsHtml,
        },
      });

      if (questions.length > 0) {
        await tx.question.createMany({
          data: questions.map((q) => ({
            campaignId: created.id,
            type: q.type,
            text: q.text,
            imageUrl: q.imageUrl,
            options: q.options as object,
            correctOption: q.correctOption,
            correctOptions: q.correctOptions,
            wordLimit: q.wordLimit,
            timeLimitSec: q.timeLimitSec,
            basePoints: q.basePoints,
            speedBonusMax: q.speedBonusMax,
            orderIndex: q.orderIndex,
          })),
        });
      }

      return created;
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/duplicate error:", err);
    return NextResponse.json({ error: "Failed to duplicate campaign" }, { status: 500 });
  }
}
