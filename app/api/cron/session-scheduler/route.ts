// app/api/cron/session-scheduler/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();

    // Auto-start campaigns whose scheduledAt has passed
    const toStart = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.SCHEDULED,
        autoStart: true,
        scheduledAt: { lte: now },
      },
    });
    for (const c of toStart) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: CampaignStatus.LIVE, startedAt: now },
      });
    }

    // Auto-end campaigns whose scheduledEnd has passed, or — only for
    // campaigns that never set one — that have exceeded durationSec.
    // scheduledEnd is the authoritative close time once set (matches
    // lib/campaign-window.ts's campaignCloseAt semantics): a campaign with
    // a real end time configured must never be cut off early by durationSec
    // (the sum of question time limits, often much shorter than the
    // admin's intended window). durationSec only applies as a safety net
    // for campaigns that never configured an explicit end time at all.
    const live = await prisma.campaign.findMany({
      where: { status: { in: [CampaignStatus.LIVE, CampaignStatus.PAUSED] }, startedAt: { not: null } },
    });
    const toEnd = live.filter(c => {
      if (c.scheduledEnd) return now >= c.scheduledEnd;
      if (!c.startedAt || !c.durationSec) return false;
      const elapsed = (now.getTime() - c.startedAt.getTime()) / 1000;
      return elapsed >= c.durationSec;
    });
    for (const c of toEnd) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: CampaignStatus.ENDED, endedAt: now },
      });
    }

    return NextResponse.json({ started: toStart.length, ended: toEnd.length });
  } catch (err) {
    console.error("GET /api/cron/session-scheduler error:", err);
    return NextResponse.json({ error: "Failed to process scheduled campaigns" }, { status: 500 });
  }
}
