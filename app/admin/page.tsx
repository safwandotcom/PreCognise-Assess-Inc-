"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import KpiCard from "@/components/admin/KpiCard";
import CandidateGrid, { AdminCandidate } from "@/components/admin/CandidateGrid";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";

interface Stats {
  registered: number;
  joined: number;
  active: number;
  completed: number;
  disqualified: number;
  total: number;
}

interface Campaign {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  _count: { candidates: number };
}

type SessionStatus = "WAITING" | "LIVE" | "PAUSED" | "ENDED";

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("WAITING");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [lastBroadcast, setLastBroadcast] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "pause" | "end" | null>(null);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/admin/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    const res = await fetch("/api/admin/candidates");
    if (res.ok) {
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCandidates();
    fetchCampaigns();
    const interval = setInterval(() => { fetchStats(); fetchCandidates(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCandidates, fetchCampaigns]);

  useEffect(() => {
    const socket = getAdminSocket();
    socket.emit("admin:join");
    socket.on("candidate:event", (updated: AdminCandidate) => {
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    });
    socket.on("stats:update", fetchStats);
    return () => {
      socket.off("candidate:event");
      socket.off("stats:update");
      disconnectAdminSocket();
    };
  }, [fetchStats]);

  async function runSessionAction(action: "start" | "pause" | "end") {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setSessionStatus(data.status);
        const socket = getAdminSocket();
        if (action === "start") socket.emit("session:start");
        if (action === "end") socket.emit("session:end");
      }
    } finally {
      setBusy(null);
    }
  }

  function sendBroadcast() {
    const msg = broadcastMsg.trim();
    if (!msg) return;
    getAdminSocket().emit("admin:broadcast", { message: msg });
    setLastBroadcast(msg);
    setBroadcastMsg("");
  }

  const isLive = sessionStatus === "LIVE";
  const completionRate = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-8 px-7 py-6">

      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Dashboard</h1>
          <p className="text-sm text-[#64748B]">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Link
          href="/admin/session"
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          New Session
        </Link>
      </div>

      {/* ── LIVE SECTION ─────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold text-[#0F172A]">Live Session</h2>
          {isLive && (
            <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-green-700">
              <span className="h-1.5 w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-green-500" />
              Active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Main session card */}
          <div className={`col-span-1 rounded-xl border bg-white p-5 md:col-span-1 ${isLive ? "border-green-300 shadow-[0_0_0_1px_#86efac,0_4px_16px_rgba(34,197,94,0.08)]" : "border-[#E2E8F0]"}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-bricolage)] text-lg font-bold text-[#0F172A]">
                  {isLive ? "Session active" : sessionStatus === "WAITING" ? "No active session" : `Session ${sessionStatus.toLowerCase()}`}
                </p>
                <p className="mt-0.5 text-sm text-[#64748B]">
                  {isLive ? `${stats?.active ?? 0} candidates answering` : "Start a session to begin"}
                </p>
              </div>
              {isLive && (
                <span className="shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  LIVE
                </span>
              )}
            </div>

            {stats && (
              <div className="mb-4 flex gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span className="text-[#64748B]"><strong className="text-[#0F172A]">{stats.joined}</strong> joined</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-[#64748B]"><strong className="text-[#0F172A]">{stats.active}</strong> active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <span className="text-[#64748B]"><strong className="text-[#0F172A]">{stats.completed}</strong> done</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-[#E2E8F0] pt-4">
              <button
                onClick={() => runSessionAction("start")}
                disabled={busy !== null}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === "start" ? "Starting…" : "Start"}
              </button>
              <button
                onClick={() => runSessionAction("pause")}
                disabled={busy !== null}
                className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {busy === "pause" ? "Pausing…" : "Pause"}
              </button>
              <button
                onClick={() => runSessionAction("end")}
                disabled={busy !== null}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                {busy === "end" ? "Ending…" : "End Session"}
              </button>
            </div>
          </div>

          {/* Candidate progress */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-3 text-[13px] font-semibold text-[#0F172A]">Candidate progress</p>
            {stats ? (
              <>
                <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%`,
                      background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)",
                    }}
                  />
                </div>
                <p className="mb-4 text-xs text-[#64748B]">
                  {stats.completed} of {stats.total} submitted
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Registered", count: stats.registered },
                    { label: "In waiting room", count: stats.joined },
                    { label: "Answering questions", count: stats.active },
                    { label: "Submitted", count: stats.completed },
                    { label: "Disqualified", count: stats.disqualified, red: true },
                  ].map(({ label, count, red }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B]">{label}</span>
                      <span className={`text-xs font-semibold ${red ? "text-red-600" : "text-[#0F172A]"}`}>{count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#94A3B8]">Loading…</p>
            )}
          </div>

          {/* Broadcast */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-1 text-[13px] font-semibold text-[#0F172A]">Broadcast to candidates</p>
            <p className="mb-3 text-xs text-[#64748B]">Message appears instantly on all candidate screens.</p>
            <textarea
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              rows={3}
              placeholder="Type a message…"
              className="mb-2 w-full resize-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:bg-white"
            />
            <button
              onClick={sendBroadcast}
              className="w-full rounded-lg py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
            >
              Send to all candidates
            </button>
            {lastBroadcast && (
              <div className="mt-3 rounded-lg bg-[#F8FAFC] px-3 py-2">
                <p className="text-[11px] font-medium text-[#64748B]">Last sent</p>
                <p className="text-xs text-[#0F172A]">&ldquo;{lastBroadcast}&rdquo;</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── ANALYTICS SECTION ────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#0F172A]">Overview</h2>
        </div>

        {/* KPI cards */}
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Total Candidates"
            value={stats?.total ?? 0}
            iconBg="bg-[#EEF2FF]"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2E0BFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
          />
          <KpiCard
            label="Active Now"
            value={stats?.active ?? 0}
            iconBg="bg-green-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>}
          />
          <KpiCard
            label="Completed"
            value={stats?.completed ?? 0}
            iconBg="bg-blue-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>}
          />
          <KpiCard
            label="Completion Rate"
            value={`${completionRate}%`}
            iconBg="bg-amber-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          />
        </div>

        {/* Campaigns table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
            <p className="text-sm font-semibold text-[#0F172A]">Campaigns</p>
            <Link href="/admin/campaigns" className="text-xs font-medium text-[#2E0BFC] hover:underline">
              View all →
            </Link>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Candidates</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-[#94A3B8]">
                    No campaigns yet.{" "}
                    <Link href="/admin/campaigns" className="text-[#2E0BFC] hover:underline">Create one →</Link>
                  </td>
                </tr>
              ) : (
                campaigns.slice(0, 5).map((c) => (
                  <tr key={c.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3.5 font-medium text-[#0F172A]">{c.name}</td>
                    <td className="px-5 py-3.5 text-[#64748B]">
                      {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5 text-[#64748B]">{c._count.candidates}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                        c.active
                          ? "bg-green-50 text-green-700"
                          : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                      }`}>
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/campaigns/${c.id}`} className="text-xs font-medium text-[#2E0BFC] hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Candidate grid */}
        {candidates.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 text-[13px] font-semibold text-[#0F172A]">
              Candidates <span className="ml-1 text-xs font-normal text-[#64748B]">live · refreshes every 3s</span>
            </p>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <CandidateGrid candidates={candidates} />
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
