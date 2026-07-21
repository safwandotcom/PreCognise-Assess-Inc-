// app/api/admin/campaigns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uniqueJoinSlug } from "@/lib/join-slug";

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { candidates: true, questions: true } },
      },
    });
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("GET /api/admin/campaigns error:", err);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const joinToken = await uniqueJoinSlug(name.trim(), prisma);
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        joinToken,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        autoStart: autoStart ?? false,
        maxCandidates: maxCandidates ?? null,
        negativeMarking: negativeMarking ?? false,
        negativeMarkingValue: negativeMarkingValue ?? 0.25,
        logoUrl: logoUrl?.trim() || null,
        bgColor: bgColor?.trim() || "#F8FAFC",
      },
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/campaigns error:", err);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
