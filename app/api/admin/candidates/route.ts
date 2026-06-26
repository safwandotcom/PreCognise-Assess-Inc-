import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.candidate.findMany({
    select: {
      id: true,
      accessId: true,
      name: true,
      country: true,
      status: true,
      disqualifyReason: true,
      tabSwitchCount: true,
    },
    orderBy: { accessId: "asc" },
  });

  const candidates = rows.map((c) => ({
    id: c.id,
    rollNumber: c.accessId,
    name: c.name,
    country: c.country,
    status: c.status,
    disqualifyReason: c.disqualifyReason,
    tabSwitchCount: c.tabSwitchCount,
  }));

  return NextResponse.json({ candidates });
}
