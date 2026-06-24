// app/admin/session/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SessionStatus = "SCHEDULED" | "WAITING" | "LIVE" | "PAUSED" | "ENDED";

interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  joinToken: string;
  scheduledAt: string | null;
  autoStart: boolean;
  createdAt: string;
  _count: { candidates: number; questions: number };
}

const STATUS_STYLES: Record<SessionStatus, { label: string; badge: string; dot: string }> = {
  SCHEDULED: { label: "Scheduled", badge: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  WAITING:   { label: "Waiting",   badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  LIVE:      { label: "Live",      badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  PAUSED:    { label: "Paused",    badge: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  ENDED:     { label: "Ended",     badge: "bg-red-50 text-red-700 border-red-200",         dot: "bg-red-500" },
};

export default function AdminSessionListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/admin/session");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  function copyLink(joinToken: string) {
    const url = `${window.location.origin}/join/${joinToken}`;
    navigator.clipboard.writeText(url);
    setCopied(joinToken);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="px-7 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Sessions</h1>
          <p className="text-sm text-[#64748B]">Create and manage assessment sessions.</p>
        </div>
        <Link
          href="/admin/session/new"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}
        >
          + New Session
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-[#64748B]">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white py-20 text-center">
          <p className="font-medium text-[#0F172A]">No sessions yet</p>
          <p className="mt-1 text-sm text-[#64748B]">Create your first session to get started.</p>
          <Link
            href="/admin/session/new"
            className="mt-5 rounded-lg bg-[#2E0BFC] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1E06B8]"
          >
            New Session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const st = STATUS_STYLES[s.status];
            return (
              <div key={s.id} className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <span className="truncate font-semibold text-[#0F172A]">{s.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-[#64748B]">
                    <span>{s._count.candidates} candidates</span>
                    <span>{s._count.questions} questions</span>
                    {s.scheduledAt && (
                      <span>Scheduled: {new Date(s.scheduledAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(s.joinToken)}
                    className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] transition"
                  >
                    {copied === s.joinToken ? "Copied!" : "Copy link"}
                  </button>
                  <Link
                    href={`/admin/session/${s.id}`}
                    className="rounded-lg bg-[#2E0BFC] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition"
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
