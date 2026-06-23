import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/campaign-utils";

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("GET /api/admin/campaigns error:", err);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, slug: rawSlug, expiresAt, maxCandidates } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const slug = rawSlug ? slugify(rawSlug) : slugify(name);

    if (!slug) {
      return NextResponse.json({ error: "Invalid slug — use letters, numbers, and hyphens" }, { status: 400 });
    }

    const existing = await prisma.campaign.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "Slug already in use — choose a different name" }, { status: 409 });
    }

    const session = await prisma.session.findFirst();
    if (!session) {
      return NextResponse.json({ error: "No session found. Create a session first." }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        slug,
        sessionId: session.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxCandidates: maxCandidates ? Number(maxCandidates) : null,
      },
      include: { _count: { select: { candidates: true } } },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/campaigns error:", err);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
