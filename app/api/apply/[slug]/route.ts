import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeRollNumber } from "@/lib/campaign-utils";

type Params = { params: Promise<{ slug: string }> };

// GET — returns campaign info + branding for the self-registration page
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;

    const [campaign, branding] = await Promise.all([
      prisma.campaign.findUnique({
        where: { slug },
        include: { _count: { select: { candidates: true } } },
      }),
      prisma.orgBranding.findFirst(),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Surface why the campaign is unavailable without exposing internals
    const now = new Date();
    const expired = campaign.expiresAt && campaign.expiresAt < now;
    const full =
      campaign.maxCandidates !== null &&
      campaign._count.candidates >= campaign.maxCandidates;

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        active: campaign.active,
        expired,
        full,
      },
      branding: {
        orgName: branding?.orgName ?? "PreCognise",
        tagline: branding?.tagline ?? "Candidate Assessment",
        logoUrl: branding?.logoUrl ?? null,
        primaryColour: branding?.primaryColour ?? "#3730A3",
      },
    });
  } catch (err) {
    console.error("GET /api/apply/[slug] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST — register a candidate via the campaign link
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const { name, email, country } = await req.json();

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      include: { _count: { select: { candidates: true } } },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.active) {
      return NextResponse.json({ error: "This campaign is no longer accepting registrations" }, { status: 403 });
    }

    const now = new Date();
    if (campaign.expiresAt && campaign.expiresAt < now) {
      return NextResponse.json({ error: "This campaign has expired" }, { status: 403 });
    }

    if (campaign.maxCandidates !== null && campaign._count.candidates >= campaign.maxCandidates) {
      return NextResponse.json({ error: "Maximum capacity reached" }, { status: 403 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await prisma.candidate.findUnique({ where: { email: normalizedEmail } });
    if (exists) {
      return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
    }

    const seq = campaign._count.candidates + 1;
    const rollNumber = makeRollNumber(campaign.slug, seq);
    const tempPassword = generatePassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.candidate.create({
      data: {
        rollNumber,
        email: normalizedEmail,
        name: name.trim(),
        country: country?.trim() || null,
        passwordHash,
        sessionId: campaign.sessionId,
        campaignId: campaign.id,
      },
    });

    return NextResponse.json({ rollNumber, password: tempPassword }, { status: 201 });
  } catch (err) {
    console.error("POST /api/apply/[slug] error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
