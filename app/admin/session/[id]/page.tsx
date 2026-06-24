// app/admin/session/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAdminSocket } from "@/lib/admin-socket-client";

type SessionStatus = "SCHEDULED" | "WAITING" | "LIVE" | "PAUSED" | "ENDED";
type CandidateStatus = "REGISTERED" | "JOINED" | "ACTIVE" | "COMPLETED" | "DISQUALIFIED";

interface Candidate {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  status: CandidateStatus;
  tabSwitchCount: number;
  disqualifyReason: string | null;
}

interface SessionDetail {
  id: string;
  title: string;
  status: SessionStatus;
  joinToken: string;
  scheduledAt: string | null;
  autoStart: boolean;
  candidates: Candidate[];
  _count: { questions: number };
}

const STATUS_STYLES: Record<SessionStatus, { label: string; badge: string; dot: string }> = {
  SCHEDULED: { label: "Scheduled", badge: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  WAITING:   { label: "Waiting",   badge: "bg-slate-100 text-slate-600 border-slate-200",   dot: "bg-slate-400" },
  LIVE:      { label: "Live",      badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  PAUSED:    { label: "Paused",    badge: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  ENDED:     { label: "Ended",     badge: "bg-red-50 text-red-700 border-red-200",           dot: "bg-red-500" },
};

const CANDIDATE_STATUS_STYLES: Record<CandidateStatus, string> = {
  REGISTERED:   "bg-slate-100 text-slate-600",
  JOINED:       "bg-blue-50 text-blue-700",
  ACTIVE:       "bg-emerald-50 text-emerald-700",
  COMPLETED:    "bg-indigo-50 text-indigo-700",
  DISQUALIFIED: "bg-red-50 text-red-700",
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broadcast, setBroadcast] = useState("");
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  // Manual add candidate
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRoll, setAddRoll] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [newCredential, setNewCredential] = useState<{ rollNumber: string; password: string } | null>(null);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/admin/session/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchSession();
    getAdminSocket().emit("admin:join");
  }, [fetchSession]);

  async function runAction(action: "start" | "pause" | "end" | "unlock") {
    if (!session) return;
    setBusy(true);
    const res = await fetch(`/api/admin/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setSession((prev) => prev ? { ...prev, status: data.status } : prev);
      const socket = getAdminSocket();
      if (action === "start") socket.emit("session:start");
      if (action === "end") socket.emit("session:end");
    }
  }

  function sendBroadcast() {
    const trimmed = broadcast.trim();
    if (!trimmed) return;
    getAdminSocket().emit("admin:broadcast", { message: trimmed });
    setSentMsg(`Sent: "${trimmed}"`);
    setBroadcast("");
  }

  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addName.trim() || !addRoll.trim() || !addEmail.trim()) {
      setAddError("All fields required");
      return;
    }
    setAddBusy(true);
    const res = await fetch(`/api/admin/session/${id}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName.trim(), rollNumber: addRoll.trim(), email: addEmail.trim() }),
    });
    const data = await res.json();
    setAddBusy(false);
    if (!res.ok) { setAddError(data.error || "Failed"); return; }
    setNewCredential({ rollNumber: data.candidate.rollNumber, password: data.password });
    setSession((prev) => prev ? { ...prev, candidates: [...prev.candidates, data.candidate] } : prev);
    setAddName(""); setAddRoll(""); setAddEmail("");
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/join/${session!.joinToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputCls = "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]";

  if (loading) return <div className="px-7 py-6 text-sm text-[#64748B]">Loading…</div>;
  if (!session) return <div className="px-7 py-6 text-sm text-red-600">Session not found.</div>;

  const st = STATUS_STYLES[session.status];

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/session" className="text-sm text-[#64748B] hover:text-[#0F172A]">← Sessions</Link>
          <span className="text-[#CBD5E1]">/</span>
          <h1 className="text-xl font-bold text-[#0F172A]">{session.title}</h1>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>
        <a href={`/admin/questions?sessionId=${session.id}`} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC]">
          Questions ({session._count.questions}) →
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Join link */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">Join link</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 truncate rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm font-mono text-[#0F172A]">
                {typeof window !== "undefined" ? `${window.location.origin}/join/${session.joinToken}` : `/join/${session.joinToken}`}
              </code>
              <button onClick={copyLink} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] shrink-0">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Candidates */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#0F172A]">Candidates ({session.candidates.length})</p>
              <button onClick={() => setShowAddForm((v) => !v)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC]">
                + Add manually
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddCandidate} className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-4">
                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} className={inputCls} placeholder="Full name" />
                <input type="text" value={addRoll} onChange={(e) => setAddRoll(e.target.value)} className={inputCls} placeholder="Roll number" />
                <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} className={inputCls} placeholder="Email" />
                <div className="col-span-3 flex items-center gap-2">
                  {addError && <p className="text-xs text-red-600">{addError}</p>}
                  <button type="submit" disabled={addBusy} className="rounded-lg bg-[#2E0BFC] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {addBusy ? "Adding…" : "Add"}
                  </button>
                </div>
              </form>
            )}

            {newCredential && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-800">Candidate added — save these credentials:</p>
                <p className="mt-1 text-xs font-mono text-emerald-700">Roll: {newCredential.rollNumber} · Password: {newCredential.password}</p>
                <button onClick={() => setNewCredential(null)} className="mt-2 text-xs text-emerald-600 underline">Dismiss</button>
              </div>
            )}

            {session.candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#94A3B8]">No candidates yet.</p>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {session.candidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CANDIDATE_STATUS_STYLES[c.status]}`}>{c.status}</span>
                    <span className="font-mono text-xs text-[#64748B]">{c.rollNumber}</span>
                    <span className="text-sm text-[#0F172A]">{c.name}</span>
                    <span className="text-xs text-[#94A3B8]">{c.email}</span>
                    {c.tabSwitchCount > 0 && (
                      <span className="ml-auto text-xs text-amber-600">{c.tabSwitchCount} tab switches</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: live controls + broadcast */}
        <div className="space-y-6">
          {/* Live controls */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-[#64748B]">Session control</p>
            <div className="flex flex-col gap-2">
              {session.status === "WAITING" && (
                <button onClick={() => runAction("start")} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Start Session"}
                </button>
              )}
              {session.status === "SCHEDULED" && (
                <button onClick={() => runAction("unlock")} disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Unlock Early"}
                </button>
              )}
              {session.status === "LIVE" && (
                <button onClick={() => runAction("pause")} disabled={busy}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Pause Session"}
                </button>
              )}
              {session.status === "PAUSED" && (
                <button onClick={() => runAction("start")} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Resume Session"}
                </button>
              )}
              {(session.status === "LIVE" || session.status === "PAUSED") && (
                <button onClick={() => runAction("end")} disabled={busy}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition">
                  {busy ? "Working…" : "End Session"}
                </button>
              )}
              {session.status === "ENDED" && (
                <p className="text-center text-xs text-[#94A3B8]">Session has ended.</p>
              )}
            </div>
            {session.scheduledAt && (
              <p className="mt-3 text-xs text-[#64748B]">
                Scheduled: {new Date(session.scheduledAt).toLocaleString()}
                {session.autoStart ? " (auto-start)" : " (manual start)"}
              </p>
            )}
          </div>

          {/* Broadcast */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-[#0F172A]">Broadcast</p>
            <p className="mb-3 text-xs text-[#64748B]">Appears as a toast on all candidate screens.</p>
            <div className="flex gap-2">
              <input
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
                placeholder="Type a message…"
                className={inputCls}
              />
              <button onClick={sendBroadcast}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
                style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
                Send
              </button>
            </div>
            {sentMsg && <p className="mt-2 text-xs text-[#64748B]">{sentMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
