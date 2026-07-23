// app/api/admin/disqualify/route.ts
import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const { candidateId, reason } = await req.json();

    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cand = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { campaignId: true } });
    if (!cand || !(await ownedCampaign(cand.campaignId, ownerId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: "DISQUALIFIED",
        disqualifyReason: reason,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Disqualify route error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}