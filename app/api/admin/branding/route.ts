import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getOrCreate() {
  let branding = await prisma.orgBranding.findFirst();
  if (!branding) {
    branding = await prisma.orgBranding.create({ data: {} });
  }
  return branding;
}

export async function GET() {
  try {
    const branding = await getOrCreate();
    return NextResponse.json({ branding });
  } catch (err) {
    console.error("GET /api/admin/branding error:", err);
    return NextResponse.json({ error: "Failed to load branding" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { orgName, tagline, logoUrl, primaryColour } = await req.json();

    if (!orgName?.trim()) {
      return NextResponse.json({ error: "orgName is required" }, { status: 400 });
    }

    const existing = await prisma.orgBranding.findFirst();

    const branding = existing
      ? await prisma.orgBranding.update({
          where: { id: existing.id },
          data: {
            orgName: orgName.trim(),
            tagline: tagline?.trim() ?? "",
            logoUrl: logoUrl?.trim() || null,
            primaryColour: primaryColour ?? "#3730A3",
          },
        })
      : await prisma.orgBranding.create({
          data: {
            orgName: orgName.trim(),
            tagline: tagline?.trim() ?? "",
            logoUrl: logoUrl?.trim() || null,
            primaryColour: primaryColour ?? "#3730A3",
          },
        });

    return NextResponse.json({ branding });
  } catch (err) {
    console.error("PUT /api/admin/branding error:", err);
    return NextResponse.json({ error: "Failed to save branding" }, { status: 500 });
  }
}
