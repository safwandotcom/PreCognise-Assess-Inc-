import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandingForOwner } from "@/lib/branding";
import { verifyToken } from "@/lib/jwt";

async function ownerFromRequest(req: NextRequest): Promise<{ ownerId: string | null; campaign: { logoUrl: string | null; bgColor: string; name: string } | null }> {
  const joinToken = req.nextUrl.searchParams.get("token");
  if (joinToken) {
    const campaign = await prisma.campaign.findUnique({
      where: { joinToken },
      select: { ownerId: true, logoUrl: true, bgColor: true, name: true },
    });
    if (campaign) return { ownerId: campaign.ownerId, campaign };
  }
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (bearer) {
    try {
      const { campaignId } = verifyToken(bearer);
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerId: true, logoUrl: true, bgColor: true, name: true },
      });
      if (campaign) return { ownerId: campaign.ownerId, campaign };
    } catch { /* invalid/expired token → no owner context */ }
  }
  return { ownerId: null, campaign: null };
}

// Public — no auth required. Candidate pages use this to fetch org branding.
// Accepts ?token=[joinToken] (pre-login) or a candidate Bearer JWT (post-login)
// to resolve the campaign owner's branding.
export async function GET(req: NextRequest) {
  try {
    const { ownerId, campaign } = await ownerFromRequest(req);
    if (ownerId) {
      const branding = await getBrandingForOwner(ownerId);
      return NextResponse.json({
        orgName: branding.orgName,
        primaryColour: branding.primaryColour,
        logoUrl: campaign?.logoUrl ?? branding.logoUrl ?? null,
        bgColor: campaign?.bgColor ?? "#F8FAFC",
      });
    }
    return NextResponse.json({ orgName: "PreCognise", primaryColour: "#6366F1", logoUrl: null, bgColor: "#F8FAFC" });
  } catch (err) {
    console.error("GET /api/branding error:", err);
    return NextResponse.json(
      { orgName: "PreCognize", primaryColour: "#6366F1", logoUrl: null, bgColor: "#F8FAFC" },
      { status: 200 }
    );
  }
}
