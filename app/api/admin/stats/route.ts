// app/api/admin/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/tenant";

// Protected by middleware.ts (Clerk) — only reachable by a logged-in admin.
export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [registered, joined, active, completed, disqualified] =
      await Promise.all([
        prisma.candidate.count({ where: { status: "REGISTERED", campaign: { ownerId } } }),
        prisma.candidate.count({ where: { status: "JOINED", campaign: { ownerId } } }),
        prisma.candidate.count({ where: { status: "ACTIVE", campaign: { ownerId } } }),
        prisma.candidate.count({ where: { status: "COMPLETED", campaign: { ownerId } } }),
        prisma.candidate.count({ where: { status: "DISQUALIFIED", campaign: { ownerId } } }),
      ]);

    return NextResponse.json({
      registered,
      joined,
      active,
      completed,
      disqualified,
      total: registered + joined + active + completed + disqualified,
    });
  } catch (err) {
    console.error("Admin stats route error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}