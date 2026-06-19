// app/admin/session/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";

type SessionStatus = "WAITING" | "LIVE" | "PAUSED" | "ENDED";

const STATUS_COLOR: Record<SessionStatus, string> = {
  WAITING: "text-gray-400",
  LIVE: "text-green-400",
  PAUSED: "text-yellow-400",
  ENDED: "text-red-400",
};

export default function AdminSessionPage() {
  const [status, setStatus] = useState<SessionStatus>("WAITING");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useEffect(() => {
    getAdminSocket().emit("admin:join");
    return () => disconnectAdminSocket();
  }, []);

  async function runAction(action: "start" | "end") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setStatus(data.status);
      const socket = getAdminSocket();
      if (action === "start") socket.emit("session:start");
      if (action === "end") socket.emit("session:end");
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  function sendBroadcast() {
    const trimmed = message.trim();
    if (!trimmed) return;

    // handlers.ts relays this to everyone in the "candidates" room, which
    // BroadcastToast picks up on waiting-room and exam pages.
    getAdminSocket().emit("admin:broadcast", { message: trimmed });
    setSentMsg(`Sent: "${trimmed}"`);
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-gray-900 p-6 text-gray-100">
      <div className="mx-auto max-w-2xl">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-300">
          ← Back to dashboard
        </Link>

        <h1 className="mt-2 text-2xl font-bold">Session Control</h1>

        <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/60 p-5">
          <p className="text-sm text-gray-400">Current status</p>
          <p className={`text-3xl font-bold ${STATUS_COLOR[status]}`}>
            {status}
          </p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => runAction("start")}
              disabled={busy}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              Start Session
            </button>
            <button
              onClick={() => runAction("end")}
              disabled={busy}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              End Session
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/60 p-5">
          <p className="mb-2 text-sm font-semibold text-gray-300">
            Broadcast Message
          </p>
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message to all candidates..."
              className="flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            />
            <button
              onClick={sendBroadcast}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Send
            </button>
          </div>
          {sentMsg && (
            <p className="mt-2 text-xs text-gray-500">{sentMsg}</p>
          )}
        </div>
      </div>
    </main>
  );
}