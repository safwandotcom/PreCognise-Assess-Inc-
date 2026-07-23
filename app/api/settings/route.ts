import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTINGS_DEFAULTS } from "@/lib/get-settings";
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

// Public — no auth. Exam page and waiting room fetch this on mount.
// Accepts ?token=[joinToken] (pre-login) or a candidate Bearer JWT (post-login)
// to resolve the campaign owner's anti-cheat settings.
export async function GET(req: NextRequest) {
  try {
    const { ownerId } = await ownerFromRequest(req);
    if (ownerId) {
      const settings = await getSettings(ownerId);
      return NextResponse.json(settings, {
        headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=30" },
      });
    }
    return NextResponse.json(SETTINGS_DEFAULTS);
  } catch (err) {
    console.error("GET /api/settings error:", err);
    // Return safe defaults on error so the exam page is never blocked
    return NextResponse.json(SETTINGS_DEFAULTS);
  }
}
