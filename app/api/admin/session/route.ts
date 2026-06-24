// app/api/admin/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

const ACTION_TO_STATUS: Record<string, SessionStatus> = {
  start: SessionStatus.LIVE,
  pause: SessionStatus.PAUSED,
  end: SessionStatus.ENDED,
  unlock: SessionStatus.WAITING,
};

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { candidates: true, questions: true } },
      },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("GET /api/admin/session error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, scheduledAt, autoStart, action, id } = body;

    // Legacy live-control action (start/pause/end/unlock) on a specific session
    if (action && id) {
      const status = ACTION_TO_STATUS[action];
      if (!status) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
      const session = await prisma.session.update({
        where: { id },
        data: {
          status,
          ...(action === "start" ? { startedAt: new Date() } : {}),
        },
      });
      return NextResponse.json({ ok: true, status: session.status });
    }

    // Create new session
    const session = await prisma.session.create({
      data: {
        title: title?.trim() || "Untitled Session",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        autoStart: autoStart ?? false,
        status: scheduledAt ? SessionStatus.SCHEDULED : SessionStatus.WAITING,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/session error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
