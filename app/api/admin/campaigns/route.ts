// app/api/admin/campaigns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { candidates: true, questions: true } },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
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
}
