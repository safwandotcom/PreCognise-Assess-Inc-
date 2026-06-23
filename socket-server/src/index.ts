// socket-server/src/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import jwt from "jsonwebtoken";
import { registerCandidateHandlers, registerAdminHandlers } from "./handlers";

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from socket-server's environment");
}

const app = express();
app.use(cors({ origin: FRONTEND_URL }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL },
});

io.on("connection", (socket) => {
  const { token, isAdmin } = socket.handshake.auth as {
    token?: string;
    isAdmin?: boolean;
  };

  if (isAdmin) {
    registerAdminHandlers(io, socket);
    return;
  }

  if (!token) {
    console.log(`Rejected socket ${socket.id}: no token and not flagged admin`);
    socket.disconnect();
    return;
  }

  // Candidate connection — must present a valid JWT or we drop it.
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      candidateId: string;
      rollNumber: string;
    };

    socket.join(payload.candidateId); // a private room named after their own id
    registerCandidateHandlers(io, socket, payload);
  } catch {
    console.log(`Rejected socket ${socket.id}: invalid or expired token`);
    socket.disconnect();
  }
});

httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});