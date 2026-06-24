// app/api/cron/session-scheduler/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
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

  // Auto-end campaigns that have exceeded durationSec
  const live = await prisma.campaign.findMany({
    where: { status: { in: [CampaignStatus.LIVE, CampaignStatus.PAUSED] }, startedAt: { not: null } },
  });
  const toEnd = live.filter(c => {
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
}
