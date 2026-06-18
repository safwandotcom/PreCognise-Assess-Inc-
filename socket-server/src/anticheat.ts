// socket-server/src/anticheat.ts
import { Server, Socket } from "socket.io";
import { getCandidate, updateStatus, incrementTabSwitch } from "./state";

// The Next.js app's URL — needed so this server can call back and persist
// the disqualification to the database. Add NEXT_APP_URL to socket-server's
// own .env file (this is separate from the Next.js .env.local).
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// anticheat.ts — change this one line
export type DisqualifyReason = "TAB_SWITCH_2" | "PAGE_REFRESH" | string;

export async function disqualifyCandidate(
  io: Server,
  candidateId: string,
  reason: DisqualifyReason
) {
  const candidate = getCandidate(candidateId);

  // Update our in-memory record right away so other code (like the
  // disconnect handler) sees the correct status immediately.
  updateStatus(candidateId, "DISQUALIFIED");

  // Tell that candidate's own browser tab — this is what makes their
  // screen redirect to /candidate/disqualified.
  if (candidate) {
    io.to(candidate.socketId).emit("disqualified", { reason });
  }

  // Tell every open admin dashboard so the grid tile turns red live.
  io.to("admins").emit("candidate:event", {
    candidateId,
    status: "DISQUALIFIED",
    reason,
  });

  // Persist to the database. Sockets are memory-only, so without this,
  // a page refresh on the admin side (or a server restart) would lose
  // the fact that this person got disqualified.
  try {
    const res = await fetch(`${FRONTEND_URL}/api/admin/disqualify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, reason }),
    });
    console.log("Disqualify DB response:", res.status);
  } catch (err) {
    console.error("Failed to persist disqualification:", err);
  }
}

export function handleTabSwitch(io: Server, socket: Socket, candidateId: string) {
  const count = incrementTabSwitch(candidateId);

  if (count === 1) {
    // First offense — just warn this one candidate. We have their `socket`
    // directly here since this only ever runs from their own connection.
    socket.emit("warning", {
      message: "Tab switch detected. Next switch will disqualify you.",
    });
  } else if (count >= 2) {
    disqualifyCandidate(io, candidateId, "TAB_SWITCH_2");
  }
}

export function handlePageRefresh(io: Server, socket: Socket, candidateId: string) {
  disqualifyCandidate(io, candidateId, "PAGE_REFRESH");
}