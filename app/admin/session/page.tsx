// app/admin/session/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getAdminSocket } from "@/lib/admin-socket-client";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  autoStart: boolean;
  _count: { candidates: number };
}

interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
}

export default function LiveSessionPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [liveCandidates, setLiveCandidates] = useState<Candidate[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastStatus, setBroadcastStatus] = useState<"idle" | "sent" | "error">("idle");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/admin/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
  }, []);

  const liveCampaign = campaigns.find(c => c.status === "LIVE" || c.status === "PAUSED");

  const fetchLiveCandidates = useCallback(async () => {
    if (!liveCampaign) return;
    const res = await fetch(`/api/admin/campaigns/${liveCampaign.id}/candidates`);
    const data = await res.json();
    setLiveCandidates(data.candidates ?? []);
  }, [liveCampaign?.id]);

  useEffect(() => {
    fetchCampaigns();
    // 60s polling fallback
    pollingRef.current = setInterval(fetchCampaigns, 60_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchCampaigns]);

  useEffect(() => {
    if (!liveCampaign) return;
    fetchLiveCandidates();
    const socket = getAdminSocket();
    socket.on("stats:update", fetchLiveCandidates);
    return () => { socket.off("stats:update", fetchLiveCandidates); };
  }, [liveCampaign?.id, fetchLiveCandidates]);

  async function startCampaign(id: string, delayMinutes = 0) {
    await fetch(`/api/admin/campaigns/${id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delayMinutes }),
    });
    fetchCampaigns();
  }

  async function pauseResumeCampaign(id: string, currentStatus: string) {
    const endpoint = currentStatus === "LIVE" ? "pause" : "start";
    await fetch(`/api/admin/campaigns/${id}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    fetchCampaigns();
  }

  async function endCampaign(id: string, name: string) {
    if (!confirm(`End session "${name}"? Candidates will be notified.`)) return;
    await fetch(`/api/admin/campaigns/${id}/end`, { method: "POST" });
    fetchCampaigns();
  }

  async function sendBroadcast(campaignId: string) {
    if (!broadcastMsg.trim()) return;
    const msg = broadcastMsg.trim();
    setBroadcastMsg("");
    setBroadcastStatus("idle");
    try {
      // Primary: HTTP path — stores in DB so candidates see it even without a socket
      const res = await fetch(`/api/admin/campaigns/${campaignId}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error("HTTP broadcast failed");
      setBroadcastStatus("sent");
      // Fast path: also emit via socket so candidates get it instantly (best-effort)
      try {
        const socket = getAdminSocket();
        socket.emit("admin:broadcast", { campaignId, message: msg });
      } catch { /* ignore socket errors — HTTP is the reliable path */ }
    } catch {
      setBroadcastStatus("error");
    }
    setTimeout(() => setBroadcastStatus("idle"), 3000);
  }

  async function removeCandidate(campaignId: string, candidateId: string) {
    if (!confirm("Remove this candidate from the session?")) return;
    await fetch(`/api/admin/campaigns/${campaignId}/candidates/${candidateId}`, { method: "DELETE" });
    fetchLiveCandidates();
  }

  const elapsed = liveCampaign?.startedAt
    ? Math.floor((Date.now() - new Date(liveCampaign.startedAt).getTime()) / 1000)
    : 0;
  const remaining = Math.max(0, (liveCampaign?.durationSec ?? 0) - elapsed);
  const progressPct = liveCampaign?.durationSec
    ? Math.min(100, (elapsed / liveCampaign.durationSec) * 100)
    : 0;

  const joined = liveCandidates.filter(c => ["JOINED", "ACTIVE", "COMPLETED"].includes(c.status)).length;
  const inWaiting = liveCandidates.filter(c => c.status === "JOINED").length;

  const upcoming = campaigns.filter(c => c.status === "SCHEDULED" || c.status === "DRAFT");
  const past = campaigns.filter(c => c.status === "ENDED");

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0F172A] mb-6">Live Session</h1>

      {/* Live/Paused campaign panel */}
      {liveCampaign && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">{liveCampaign.name}</h2>
              <p className="text-xs text-[#64748B]">
                <span className="font-semibold text-[#0F172A]">{joined}</span> / {liveCampaign._count.candidates} joined
                {inWaiting > 0 && ` · ${inWaiting} in waiting room`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => pauseResumeCampaign(liveCampaign.id, liveCampaign.status)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-1.5 text-xs font-medium"
              >
                {liveCampaign.status === "LIVE" ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => endCampaign(liveCampaign.id, liveCampaign.name)}
                className="rounded-lg bg-red-50 border border-red-200 px-4 py-1.5 text-xs font-medium text-red-600"
              >
                End Session
              </button>
            </div>
          </div>

          {/* Time bar */}
          {liveCampaign.durationSec > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-[#64748B] mb-1">
                <span>Elapsed: {formatDuration(elapsed)}</span>
                <span>Remaining: {formatDuration(remaining)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#F1F5F9]">
                <div className="h-2 rounded-full bg-[#6366F1]" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {/* Broadcast */}
          <div className="flex flex-col gap-1.5 mb-4">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm"
                placeholder="Broadcast message to all candidates…"
                value={broadcastMsg}
                onChange={e => { setBroadcastMsg(e.target.value); setBroadcastStatus("idle"); }}
                onKeyDown={e => { if (e.key === "Enter" && broadcastMsg.trim()) sendBroadcast(liveCampaign.id); }}
              />
              <button
                onClick={() => sendBroadcast(liveCampaign.id)}
                disabled={!broadcastMsg.trim()}
                className="rounded-lg bg-[#6366F1] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
            {broadcastStatus === "sent" && (
              <p className="text-xs text-green-600 font-medium">Message sent — candidates will see it within 20 seconds.</p>
            )}
            {broadcastStatus === "error" && (
              <p className="text-xs text-red-500 font-medium">Failed to send. Please try again.</p>
            )}
          </div>

          {/* Candidate table */}
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-left">
                  <th className="pb-2 pr-4">Access ID</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {liveCandidates.map(c => (
                  <tr key={c.id} className="border-b border-[#F1F5F9]">
                    <td className="py-1.5 pr-4 font-mono">{c.accessId}</td>
                    <td className="py-1.5 pr-4">{c.name}</td>
                    <td className="py-1.5 pr-4 text-[#64748B]">{c.email}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                        c.status === "JOINED" ? "bg-blue-100 text-blue-700" :
                        c.status === "COMPLETED" ? "bg-purple-100 text-purple-700" :
                        "bg-[#F1F5F9] text-[#64748B]"
                      }`}>{c.status}</span>
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => removeCandidate(liveCampaign.id, c.id)}
                        className="text-red-500 hover:underline text-[10px]"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming / Past tabs */}
      <div className="flex border-b border-[#E2E8F0] mb-4">
        {(["upcoming", "past"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === t ? "border-[#6366F1] text-[#6366F1]" : "border-transparent text-[#64748B]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "upcoming" && (
        <div className="space-y-3">
          {upcoming.length === 0 && <p className="text-sm text-[#64748B]">No upcoming campaigns.</p>}
          {upcoming.map(c => (
            <div key={c.id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-[#0F172A]">{c.name}</p>
                <p className="text-xs text-[#64748B]">
                  {c.status === "DRAFT" ? "Draft — finish setup first" : `Scheduled: ${new Date(c.scheduledAt!).toLocaleString()}`}
                  {c.autoStart && c.status === "SCHEDULED" && " · Auto-starts"}
                </p>
                <p className="text-xs text-[#94A3B8]">{c._count.candidates} candidates · {formatDuration(c.durationSec)}</p>
              </div>
              {c.status === "SCHEDULED" && (
                <div className="flex gap-2">
                  <button onClick={() => startCampaign(c.id)} className="rounded-lg bg-[#6366F1] px-3 py-1.5 text-xs font-medium text-white">
                    Start Now
                  </button>
                  <select
                    onChange={e => { if (e.target.value) startCampaign(c.id, parseInt(e.target.value)); e.target.value = ""; }}
                    className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-xs"
                    defaultValue=""
                  >
                    <option value="" disabled>Delay…</option>
                    <option value="15">+15 min</option>
                    <option value="30">+30 min</option>
                    <option value="60">+60 min</option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "past" && (
        <div className="space-y-3">
          {past.length === 0 && <p className="text-sm text-[#64748B]">No past campaigns.</p>}
          {past.map(c => (
            <div key={c.id} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <p className="font-semibold text-sm text-[#0F172A]">{c.name}</p>
              <p className="text-xs text-[#64748B]">
                Started: {c.startedAt ? new Date(c.startedAt).toLocaleString() : "—"} ·
                Ended: {c.endedAt ? new Date(c.endedAt).toLocaleString() : "—"}
              </p>
              <p className="text-xs text-[#94A3B8]">{c._count.candidates} candidates</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
