// app/api/admin/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Protected by middleware.ts (Clerk) — only reachable by a logged-in admin.
// This route only persists the Session status in the DB. The actual
// candidate-facing broadcast (session:start / session:end) is fired
// separately from the browser via getAdminSocket() — this route has no
// socket connection of its own, so it can't emit anything itself.
const ACTION_TO_STATUS: Record<string, "LIVE" | "PAUSED" | "ENDED"> = {
  start: "LIVE",
  pause: "PAUSED",
  end: "ENDED",
};

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();
    const status = ACTION_TO_STATUS[action];

    if (!status) {
      return NextResponse.json(
        { error: "action must be 'start', 'pause', or 'end'" },
        { status: 400 }
      );
    }

    // Demo seeds exactly one Session row — grab it rather than requiring
    // the admin UI to know/track a sessionId.
    const session = await prisma.session.findFirst();
    if (!session) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    await prisma.session.update({
      where: { id: session.id },
      data: {
        status,
        ...(action === "start" ? { startedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("Admin session route error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}