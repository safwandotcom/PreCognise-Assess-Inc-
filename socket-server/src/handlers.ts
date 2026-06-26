import { Server, Socket } from "socket.io";
import { addCandidate, removeCandidate, addAdminSocket, removeAdminSocket } from "./state";
import { handleTabSwitch, handlePageRefresh, disqualifyCandidate } from "./anticheat";

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

  socket.on("tab:switch", async () => {
    try {
      await handleTabSwitch(io, socket, candidateId);
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

  socket.on("admin:disqualify", ({ candidateId, reason }: { candidateId: string; reason: string }) => {
    disqualifyCandidate(io, candidateId, reason);
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
