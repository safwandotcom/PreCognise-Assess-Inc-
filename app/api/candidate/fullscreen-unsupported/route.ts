import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

// Called once a candidate's browser is confirmed not to support the
// Fullscreen API at all (iOS Safari on iPhone, most in-app browser
// webviews) — a platform limitation the client-side code detects and
// works around by skipping enforcement rather than trapping the candidate.
// This just records that it happened, for admin visibility (live view +
// results). Idempotent — safe to call more than once (device-check and the
// exam page both detect independently as a safety net).
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { fullscreenUnsupported: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/candidate/fullscreen-unsupported error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
