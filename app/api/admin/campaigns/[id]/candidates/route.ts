// app/api/admin/campaigns/[id]/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  });
  const seqOf = (accessId: string) => {
    const m = accessId.match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  candidates.sort((a, b) => seqOf(a.accessId) - seqOf(b.accessId));
  return NextResponse.json({ candidates });
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { name, email } = await req.json();

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 });
    }

    const emailNorm = email.trim().toLowerCase();
    const existing = await prisma.candidate.findFirst({
      where: { email: emailNorm, campaignId: id },
    });
    if (existing) {
      return NextResponse.json({ error: "A candidate with this email already exists in this campaign" }, { status: 409 });
    }

    const existingAccessIds = await prisma.candidate.findMany({
      where: { campaignId: id },
      select: { accessId: true },
    });

    if (campaign.maxCandidates && existingAccessIds.length >= campaign.maxCandidates) {
      return NextResponse.json({ error: "Campaign is at maximum candidate capacity" }, { status: 422 });
    }

    const nextSeq = nextAccessSeq(existingAccessIds);
    const accessId = makeAccessId(campaign.name, nextSeq, campaign.maxCandidates);
    const plainPassword = generatePassword();
    const passwordHash = await hashPassword(plainPassword);

    const candidate = await prisma.candidate.create({
      data: { accessId, email: emailNorm, name: name.trim(), passwordHash, generatedPassword: plainPassword, campaignId: id },
      select: { id: true, accessId: true, name: true, email: true, status: true },
    });

    return NextResponse.json({ candidate, password: plainPassword }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/candidates failed:", err);
    return NextResponse.json({ error: "Failed to add candidate. Please try again." }, { status: 500 });
  }
}
