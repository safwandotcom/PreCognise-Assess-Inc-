import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public — no auth required. Candidate pages use this to fetch org branding.
// Accepts ?token=[joinToken] to return per-campaign branding overrides.
export async function GET(req: NextRequest) {
  try {
    const joinToken = req.nextUrl.searchParams.get("token");

    // Per-campaign branding override
    if (joinToken) {
      const campaign = await prisma.campaign.findUnique({
        where: { joinToken },
        select: { logoUrl: true, bgColor: true, name: true },
      });
      if (campaign) {
        const global = await prisma.orgBranding.findFirst();
        return NextResponse.json({
          orgName: global?.orgName ?? "PreCognize",
          primaryColour: global?.primaryColour ?? "#6366F1",
          logoUrl: campaign.logoUrl ?? global?.logoUrl ?? null,
          bgColor: campaign.bgColor,
        });
      }
    }

    const branding = await prisma.orgBranding.findFirst();
    return NextResponse.json({
      orgName: branding?.orgName ?? "PreCognize",
      primaryColour: branding?.primaryColour ?? "#6366F1",
      logoUrl: branding?.logoUrl ?? null,
      bgColor: "#F8FAFC",
    });
  } catch (err) {
    console.error("GET /api/branding error:", err);
    return NextResponse.json(
      { orgName: "PreCognize", primaryColour: "#6366F1", logoUrl: null, bgColor: "#F8FAFC" },
      { status: 200 }
    );
  }
}
