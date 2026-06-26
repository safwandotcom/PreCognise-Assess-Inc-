import { Server, Socket } from "socket.io";
import { getCandidate, updateStatus, incrementTabSwitch } from "./state";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export type DisqualifyReason = "TAB_SWITCH_2" | "PAGE_REFRESH" | string;

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

export async function handleTabSwitch(io: Server, socket: Socket, candidateId: string) {
  const count = await incrementTabSwitch(candidateId);

  if (count === 1) {
    socket.emit("warning", {
      message: "Tab switch detected. Next switch will disqualify you.",
    });
  } else if (count === 2) {
    await disqualifyCandidate(io, candidateId, "TAB_SWITCH_2");
  }
}

export async function handlePageRefresh(io: Server, socket: Socket, candidateId: string) {
  await disqualifyCandidate(io, candidateId, "PAGE_REFRESH");
}
