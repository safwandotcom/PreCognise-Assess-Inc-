// app/api/admin/campaigns/[id]/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { CampaignStatus, CandidateStatus } from "@prisma/client";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const delayMinutes: number = body.delayMinutes ?? 0;
    const newScheduledEnd: string | undefined = body.newScheduledEnd;

    if (campaign.status === CampaignStatus.LIVE) {
      return NextResponse.json({ error: "Already live" }, { status: 409 });
    }

    const startAt = delayMinutes > 0
      ? new Date(Date.now() + delayMinutes * 60_000)
      : new Date();

    // A stale scheduledEnd from a previous run would immediately re-close the
    // campaign the instant it goes live again — most relevant when
    // restarting an ENDED campaign, but the same problem applies to any
    // campaign whose scheduledEnd is already in the past.
    let scheduledEndUpdate: { scheduledEnd?: Date } = {};
    if (campaign.scheduledEnd && campaign.scheduledEnd <= startAt) {
      if (!newScheduledEnd) {
        return NextResponse.json(
          { error: "Set a new end time to restart this campaign" },
          { status: 400 }
        );
      }
      const parsedEnd = new Date(newScheduledEnd);
      if (Number.isNaN(parsedEnd.getTime()) || parsedEnd <= startAt) {
        return NextResponse.json(
          { error: "New end time must be after the start time" },
          { status: 400 }
        );
      }
      scheduledEndUpdate = { scheduledEnd: parsedEnd };
    }

    // Restarting an ENDED campaign: candidates who were mid-exam when it
    // ended keep their activeToken from that session (nothing else in the
    // app clears it — only disqualification and the duplicate-login claim
    // do). Left alone, they could never log back in — the atomic claim in
    // POST /api/auth/login requires activeToken: null. Release the lock for
    // anyone who didn't reach a terminal state, so they can resume; leave
    // COMPLETED/DISQUALIFIED candidates as they are.
    if (campaign.status === CampaignStatus.ENDED) {
      await prisma.candidate.updateMany({
        where: {
          campaignId: id,
          status: { notIn: [CandidateStatus.COMPLETED, CandidateStatus.DISQUALIFIED] },
        },
        data: { activeToken: null },
      });
    }

    if (delayMinutes > 0) {
      const updated = await prisma.campaign.update({
        where: { id },
        data: { scheduledAt: startAt, status: CampaignStatus.SCHEDULED, endedAt: null, ...scheduledEndUpdate },
      });
      return NextResponse.json({ campaign: updated });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.LIVE, startedAt: startAt, endedAt: null, ...scheduledEndUpdate },
    });
    // Invalidate polling cache so candidates see LIVE status within their next poll cycle
    try { await redis.del(`session-stats:${id}`); } catch { /* non-fatal */ }
    return NextResponse.json({ campaign: updated });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/start error:", err);
    return NextResponse.json({ error: "Failed to start campaign" }, { status: 500 });
  }
}
