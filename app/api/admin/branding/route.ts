import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/tenant";
import { getBrandingForOwner } from "@/lib/branding";

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const branding = await getBrandingForOwner(ownerId);
    return NextResponse.json({ branding });
  } catch (err) {
    console.error("GET /api/admin/branding error:", err);
    return NextResponse.json({ error: "Failed to load branding" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgName, tagline, logoUrl, primaryColour } = await req.json();
    if (!orgName?.trim()) {
      return NextResponse.json({ error: "orgName is required" }, { status: 400 });
    }
    const existing = await prisma.orgBranding.findFirst({ where: { ownerId } });
    const data = {
      orgName: orgName.trim(),
      tagline: tagline?.trim() ?? "",
      logoUrl: logoUrl?.trim() || null,
      primaryColour: primaryColour ?? "#3730A3",
    };
    const branding = existing
      ? await prisma.orgBranding.update({ where: { id: existing.id }, data })
      : await prisma.orgBranding.create({ data: { ...data, ownerId } });
    return NextResponse.json({ branding });
  } catch (err) {
    console.error("PUT /api/admin/branding error:", err);
    return NextResponse.json({ error: "Failed to save branding" }, { status: 500 });
  }
}
