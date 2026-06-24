// app/api/admin/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        candidates: {
          select: {
            id: true,
            rollNumber: true,
            name: true,
            email: true,
            status: true,
            disqualifyReason: true,
            tabSwitchCount: true,
          },
          orderBy: { rollNumber: "asc" },
        },
        _count: { select: { questions: true } },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    console.error("GET /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, scheduledAt, autoStart, action } = body;

    if (action) {
      const statusMap: Record<string, SessionStatus> = {
        start: SessionStatus.LIVE,
        pause: SessionStatus.PAUSED,
        end: SessionStatus.ENDED,
        unlock: SessionStatus.WAITING,
      };
      const status = statusMap[action];
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

    const session = await prisma.session.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        ...(autoStart !== undefined ? { autoStart } : {}),
      },
    });
    return NextResponse.json({ session });
  } catch (err) {
    console.error("PATCH /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
