// app/api/admin/stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Protected by middleware.ts (Clerk) — only reachable by a logged-in admin.
export async function GET() {
  try {
    const [registered, joined, active, completed, disqualified] =
      await Promise.all([
        prisma.candidate.count({ where: { status: "REGISTERED" } }),
        prisma.candidate.count({ where: { status: "JOINED" } }),
        prisma.candidate.count({ where: { status: "ACTIVE" } }),
        prisma.candidate.count({ where: { status: "COMPLETED" } }),
        prisma.candidate.count({ where: { status: "DISQUALIFIED" } }),
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