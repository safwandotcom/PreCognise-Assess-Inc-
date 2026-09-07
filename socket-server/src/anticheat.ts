import { Server, Socket } from "socket.io";
import { getCandidate, updateStatus } from "./state";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export type DisqualifyReason = "PAGE_REFRESH" | string;

export async function disqualifyCandidate(
  io: Server,
  candidateId: string,
  reason: DisqualifyReason
) {
  const candidate = await getCandidate(candidateId);

  await updateStatus(candidateId, "DISQUALIFIED");

  // Emit to the candidate's private room (named after candidateId in index.ts).
  // With Redis adapter, this reaches the socket regardless of which replica it is on.
  io.to(candidateId).emit("disqualified", { reason });

  io.to("admins").emit("candidate:event", {
    id: candidateId,
    status: "DISQUALIFIED",
    disqualifyReason: reason,
    tabSwitchCount: candidate?.tabSwitchCount,
  });

  try {
    const res = await fetch(`${FRONTEND_URL}/api/admin/disqualify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ candidateId, reason }),
    });
    console.log("Disqualify DB response:", res.status);
  } catch (err) {
    console.error("Failed to persist disqualification:", err);
  }
}

export interface TabSwitchReport {
  count: number;
  limit: number;
  disqualified: boolean;
}

// /api/candidate/tab-switch (Postgres-backed) is the sole authority for
// counting tab switches and deciding disqualification — it already
// persisted the outcome before this ever runs. This just relays that
// decision onto the socket layer for live admin visibility, and mirrors
// the disqualification here so the candidate's socket is notified too.
//
// This replaces an earlier design that kept its own Redis counter and
// disqualified at a hardcoded count of 2, independent of the campaign's
// configurable tabSwitchLimit. That counter lived only in the per-candidate
// Redis hash, which handlers.ts's "disconnect" handler deletes on every
// socket disconnect — and a backgrounded browser tab (exactly what happens
// when a candidate switches to an already-open tab) routinely drops the
// WebSocket, silently resetting the count to zero before it ever reached 2.
export async function reportTabSwitch(
  io: Server,
  candidateId: string,
  report: TabSwitchReport
): Promise<void> {
  if (report.disqualified) {
    await updateStatus(candidateId, "DISQUALIFIED");
    io.to(candidateId).emit("disqualified", { reason: "TAB_SWITCH_LIMIT_EXCEEDED" });
  }

  io.to("admins").emit("candidate:event", {
    id: candidateId,
    status: report.disqualified ? "DISQUALIFIED" : "ACTIVE",
    tabSwitchCount: report.count,
    tabSwitchLimit: report.limit,
  });
}

export async function handlePageRefresh(io: Server, socket: Socket, candidateId: string) {
  await disqualifyCandidate(io, candidateId, "PAGE_REFRESH");
}
