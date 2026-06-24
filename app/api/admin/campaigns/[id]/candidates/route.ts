// app/api/admin/campaigns/[id]/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const candidates = await prisma.candidate.findMany({
    where: { campaignId: id },
    select: {
      id: true,
      accessId: true,
      name: true,
      email: true,
      status: true,
      disqualifyReason: true,
      tabSwitchCount: true,
      generatedPassword: true,
    },
    orderBy: { accessId: "asc" },
  });
  return NextResponse.json({ candidates });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { name, email } = await req.json();

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const emailNorm = email.trim().toLowerCase();
  const existing = await prisma.candidate.findFirst({
    where: { email: emailNorm, campaignId: id },
  });
  if (existing) {
    return NextResponse.json({ error: "A candidate with this email already exists in this campaign" }, { status: 409 });
  }

  const count = await prisma.candidate.count({ where: { campaignId: id } });
  const accessId = makeAccessId(campaign.name, count + 1);
  const plainPassword = generatePassword();
  const passwordHash = await hashPassword(plainPassword);

  const candidate = await prisma.candidate.create({
    data: { accessId, email: emailNorm, name: name.trim(), passwordHash, generatedPassword: plainPassword, campaignId: id },
    select: { id: true, accessId: true, name: true, email: true, status: true },
  });

  return NextResponse.json({ candidate, password: plainPassword }, { status: 201 });
}
