// socket-server/src/handlers.ts
import { Server, Socket } from "socket.io";
import { addCandidate, removeCandidate, addAdminSocket, removeAdminSocket } from "./state";
import { handleTabSwitch, handlePageRefresh, disqualifyCandidate } from "./anticheat";

interface CandidateAuth {
  candidateId: string;
  accessId: string;
  campaignId: string;
}

// Set up once per connected candidate (called from index.ts after their JWT
// has already been verified — that's where candidateId/rollNumber come from).
export function registerCandidateHandlers(
  io: Server,
  socket: Socket,
  auth: CandidateAuth
) {
  const { candidateId, accessId } = auth;

  socket.on("candidate:join", () => {
    addCandidate(candidateId, socket.id, accessId);
    socket.join("candidates"); // so session:start/end can reach everyone at once
    io.to("admins").emit("stats:update"); // tells dashboards "go refetch stats"
  });

  socket.on("tab:switch", () => {
    handleTabSwitch(io, socket, candidateId);
  });

  socket.on("page:refresh", () => {
    handlePageRefresh(io, socket, candidateId);
  });

  socket.on("disconnect", () => {
    // Cleanup only — we deliberately do NOT disqualify here. A normal
    // disconnect also fires when a candidate finishes the exam and gets
    // routed to /candidate/result, or when the admin ends the session.
    // Actual refresh-disqualification already happened via page:refresh
    // above, fired from beforeunload before the browser actually closes.
    removeCandidate(candidateId);
  });
}

// Set up once per connected admin.
export function registerAdminHandlers(io: Server, socket: Socket) {
  socket.on("admin:join", () => {
    socket.join("admins");      // lets us broadcast to all admins via io.to("admins")
    addAdminSocket(socket.id);  // our own bookkeeping, from state.ts
  });

  socket.on("session:start", () => {
    io.to("candidates").emit("session:start");
  });

  socket.on("session:end", () => {
    io.to("candidates").emit("session:end");
  });

  socket.on("admin:disqualify", ({ candidateId, reason }: { candidateId: string; reason: string }) => {
    disqualifyCandidate(io, candidateId, reason);
  });

  // NEW — relays the admin's typed message to everyone who has joined
  // the "candidates" room (i.e. past login, on waiting-room or exam).
  socket.on("admin:broadcast", ({ message }: { message: string }) => {
    if (typeof message === "string" && message.trim().length > 0) {
      io.to("candidates").emit("broadcast", { message: message.trim() });
    }
  });

  socket.on("disconnect", () => {
    removeAdminSocket(socket.id);
  });
}