import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { message } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    await prisma.campaign.update({
      where: { id },
      data: { lastBroadcast: message.trim(), lastBroadcastAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/broadcast error:", err);
    return NextResponse.json({ error: "Failed to send broadcast" }, { status: 500 });
  }
}
