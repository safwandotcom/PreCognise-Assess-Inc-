import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { candidates: true } },
        candidates: {
          select: {
            id: true,
            rollNumber: true,
            name: true,
            email: true,
            country: true,
            status: true,
          },
          orderBy: { rollNumber: "asc" },
        },
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { name, slug: rawSlug, active, expiresAt, maxCandidates } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const slug = rawSlug ? slugify(rawSlug) : undefined;

    if (slug) {
      const conflict = await prisma.campaign.findFirst({ where: { slug, NOT: { id } } });
      if (conflict) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        name: name.trim(),
        ...(slug ? { slug } : {}),
        active: Boolean(active),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxCandidates: maxCandidates ? Number(maxCandidates) : null,
      },
      include: { _count: { select: { candidates: true } } },
    });

    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("PUT /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/campaigns/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
