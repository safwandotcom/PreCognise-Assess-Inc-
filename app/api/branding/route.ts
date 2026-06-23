import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public — no auth required. Candidate pages use this to fetch org branding.
export async function GET() {
  try {
    const branding = await prisma.orgBranding.findFirst();
    return NextResponse.json(
      {
        orgName: branding?.orgName ?? "PreCognise",
        tagline: branding?.tagline ?? "Candidate Assessment",
        logoUrl: branding?.logoUrl ?? null,
        primaryColour: branding?.primaryColour ?? "#3730A3",
      },
      {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
      }
    );
  } catch (err) {
    console.error("GET /api/branding error:", err);
    return NextResponse.json(
      { orgName: "PreCognise", tagline: "Candidate Assessment", logoUrl: null, primaryColour: "#3730A3" },
      { status: 200 }
    );
  }
}
