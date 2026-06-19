// app/api/admin/candidates/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Protected by middleware.ts (Clerk) — only reachable by a logged-in admin.
// Powers the initial fill of CandidateGrid on app/admin/page.tsx mount;
// live updates after that come from the candidate:event socket and the
// 3s poll in admin/page.tsx, not a refetch triggered from here.
export async function GET() {
  try {
    const candidates = await prisma.candidate.findMany({
      select: {
        id: true,
        rollNumber: true,
        name: true,
        country: true,
        status: true,
        disqualifyReason: true,
        tabSwitchCount: true,
        // passwordHash, otpCode, otpExpiresAt deliberately excluded
      },
      orderBy: { rollNumber: "asc" },
    });

    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("Admin candidates route error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}