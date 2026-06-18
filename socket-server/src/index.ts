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
  const token = socket.handshake.auth?.token as string | undefined;

  if (token) {
    // Candidate connection — must present a valid JWT or we drop it.
    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        candidateId: string;
        rollNumber: string;
      };

      socket.join(payload.candidateId); // a private room named after their own id
      registerCandidateHandlers(io, socket, payload);
    } catch (err) {
      console.log(`Rejected socket ${socket.id}: invalid or expired token`);
      socket.disconnect();
    }
  } else {
    // No token = the admin dashboard connecting. Clerk already gated
    // the page itself before this socket was even opened.
    registerAdminHandlers(io, socket);
  }
});

httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});