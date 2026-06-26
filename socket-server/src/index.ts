import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import cors from "cors";
import jwt from "jsonwebtoken";
import { redis } from "./redis-client";
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

// Attach Redis adapter. pub client = existing connection; sub = dedicated duplicate.
const subClient = redis.duplicate();
io.adapter(createAdapter(redis, subClient));

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

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      candidateId: string;
      accessId: string;
      campaignId: string;
    };

    socket.join(payload.candidateId); // private room — used by adapter for cross-replica emit
    registerCandidateHandlers(io, socket, payload);
  } catch {
    console.log(`Rejected socket ${socket.id}: invalid or expired token`);
    socket.disconnect();
  }
});

httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
