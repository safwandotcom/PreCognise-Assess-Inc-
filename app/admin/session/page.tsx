// app/admin/session/page.tsx
"use client";

import { useEffect, useState } from "react";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";

type SessionStatus = "WAITING" | "LIVE" | "PAUSED" | "ENDED";

const STATUS_STYLES: Record<SessionStatus, { label: string; badge: string; dot: string }> = {
  WAITING: { label: "Waiting",  badge: "bg-slate-100 text-slate-600 border-slate-200",     dot: "bg-slate-400" },
  LIVE:    { label: "Live",     badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  PAUSED:  { label: "Paused",   badge: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  ENDED:   { label: "Ended",    badge: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500" },
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
    getAdminSocket().emit("admin:broadcast", { message: trimmed });
    setSentMsg(`Sent: "${trimmed}"`);
    setMessage("");
  }

  const s = STATUS_STYLES[status];

  return (
    <div className="px-7 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0F172A]">Live Session</h1>
        <p className="text-sm text-[#64748B]">Start, pause, or end the session — and broadcast messages to all candidates.</p>
      </div>

      <main className="max-w-2xl space-y-6">
        {/* Status card */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
            Current status
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${s.badge}`}>
              <span className={`h-2 w-2 rounded-full ${s.dot} ${status === "LIVE" ? "animate-pulse" : ""}`} />
              {s.label}
            </span>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => runAction("start")}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {busy ? "Working..." : "Start Session"}
            </button>
            <button
              onClick={() => runAction("end")}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
            >
              End Session
            </button>
          </div>
        </div>

        {/* Broadcast card */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold text-[#0F172A]">Broadcast Message</h2>
          <p className="mb-4 text-xs text-[#64748B]">
            This message appears as a toast on all candidate screens instantly.
          </p>
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
              placeholder="Type a message to all candidates..."
              className="flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]"
            />
            <button
              onClick={sendBroadcast}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}
            >
              Send
            </button>
          </div>
          {sentMsg && (
            <p className="mt-3 text-xs text-[#64748B]">{sentMsg}</p>
          )}
        </div>
      </main>
    </div>
  );
}

