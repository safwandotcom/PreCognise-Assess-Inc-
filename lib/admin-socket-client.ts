// lib/admin-socket-client.ts
import { io, Socket } from "socket.io-client";

// Separate from lib/socket-client.ts on purpose. The candidate socket
// authenticates with a JWT (verified in socket-server/src/index.ts).
// Admins are already gated by Clerk at the page/middleware level, so this
// connection just flags itself as an admin instead of sending a token.
let adminSocket: Socket | null = null;

export function getAdminSocket(): Socket {
  if (!adminSocket) {
    adminSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { isAdmin: true },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    adminSocket.on("connect", () => {
      adminSocket?.emit("admin:join");
    });
  }
  return adminSocket;
}

export function disconnectAdminSocket(): void {
  if (adminSocket) {
    adminSocket.disconnect();
    adminSocket = null;
  }
}