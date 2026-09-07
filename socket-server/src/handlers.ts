import { Server, Socket } from "socket.io";
import { addCandidate, removeCandidate, addAdminSocket, removeAdminSocket } from "./state";
import { reportTabSwitch, handlePageRefresh, disqualifyCandidate, TabSwitchReport } from "./anticheat";

interface CandidateAuth {
  candidateId: string;
  accessId: string;
  campaignId: string;
}

export function registerCandidateHandlers(
  io: Server,
  socket: Socket,
  auth: CandidateAuth
) {
  const { candidateId, accessId } = auth;

  socket.on("candidate:join", async () => {
    try {
      await addCandidate(candidateId, socket.id, accessId);
      socket.join("candidates");
      io.to("admins").emit("stats:update");
    } catch (err) {
      console.error("candidate:join error:", err);
      socket.disconnect();
    }
  });

  socket.on("tab:switch", async (report: TabSwitchReport) => {
    // The client sends the outcome of the already-authoritative REST call
    // (/api/candidate/tab-switch) — this is a live-visibility relay, not a
    // decision point. Ignore anything that doesn't look like a real report
    // rather than trusting/crashing on a malformed or tampered payload.
    if (
      !report ||
      typeof report.count !== "number" ||
      typeof report.limit !== "number" ||
      typeof report.disqualified !== "boolean"
    ) {
      return;
    }
    try {
      await reportTabSwitch(io, candidateId, report);
    } catch (err) {
      console.error("tab:switch error:", err);
    }
  });

  socket.on("page:refresh", async () => {
    try {
      await handlePageRefresh(io, socket, candidateId);
    } catch (err) {
      console.error("page:refresh error:", err);
    }
  });

  socket.on("disconnect", async () => {
    try {
      await removeCandidate(candidateId);
    } catch (err) {
      console.error("disconnect cleanup error:", err);
    }
  });
}

export function registerAdminHandlers(io: Server, socket: Socket) {
  socket.on("admin:join", async () => {
    try {
      socket.join("admins");
      await addAdminSocket(socket.id);
    } catch (err) {
      console.error("admin:join error:", err);
    }
  });

  socket.on("session:start", () => {
    io.to("candidates").emit("session:start");
  });

  socket.on("session:end", () => {
    io.to("candidates").emit("session:end");
  });

  socket.on("admin:disqualify", async ({ candidateId, reason }: { candidateId: string; reason: string }) => {
    try {
      await disqualifyCandidate(io, candidateId, reason);
    } catch (err) {
      console.error("admin:disqualify error:", err);
    }
  });

  socket.on("admin:broadcast", ({ message }: { message: string }) => {
    if (typeof message === "string" && message.trim().length > 0) {
      io.to("candidates").emit("broadcast", { message: message.trim() });
    }
  });

  socket.on("disconnect", async () => {
    try {
      await removeAdminSocket(socket.id);
    } catch (err) {
      console.error("admin disconnect cleanup error:", err);
    }
  });
}
