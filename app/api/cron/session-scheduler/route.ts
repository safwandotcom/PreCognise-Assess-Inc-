import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

export async function GET() {
  try {
    const now = new Date();

    const due = await prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
    });

    const results: { id: string; newStatus: SessionStatus }[] = [];

    for (const session of due) {
      const newStatus = session.autoStart ? SessionStatus.LIVE : SessionStatus.WAITING;
      await prisma.session.update({
        where: { id: session.id },
        data: {
          status: newStatus,
          ...(session.autoStart ? { startedAt: now } : {}),
        },
      });
      results.push({ id: session.id, newStatus });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    console.error("Cron session-scheduler error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
