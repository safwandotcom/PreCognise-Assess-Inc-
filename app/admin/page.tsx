// app/admin/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import KpiCard from "@/components/admin/KpiCard";
import CandidateGrid, { AdminCandidate } from "@/components/admin/CandidateGrid";
import SessionControls from "@/components/admin/SessionControls";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";

interface Stats {
  registered: number;
  joined: number;
  active: number;
  completed: number;
  disqualified: number;
  total: number;
}

const NAV_LINKS = [
  { href: "/admin/questions", label: "Question Builder" },
  { href: "/admin/branding",  label: "Branding" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/settings",  label: "Settings" },
];

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("stats fetch failed");
      setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/candidates");
      if (!res.ok) throw new Error("candidates fetch failed");
      const data = await res.json();
      setCandidates(data.candidates);
    } catch (err) {
      console.error(err);
      setLoadError("Could not load candidates.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    fetchCandidates();
    const interval = setInterval(() => {
      fetchStats();
      fetchCandidates();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCandidates]);

  useEffect(() => {
    const socket = getAdminSocket();
    socket.emit("admin:join");

    socket.on("candidate:event", (updated: AdminCandidate) => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    });

    socket.on("stats:update", () => {
      fetchStats();
    });

    return () => {
      socket.off("candidate:event");
      socket.off("stats:update");
      disconnectAdminSocket();
    };
  }, [fetchStats]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Gradient header */}
      <header
        className="px-6 py-5"
        style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-indigo-200">
              PreCognise Assess
            </p>
            <h1 className="mt-0.5 text-2xl font-bold text-white">
              Admin Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/session"
              className="rounded-lg border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
            >
              Session Control
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* KPI row */}
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <KpiCard label="Registered"   value={stats?.registered   ?? 0} color="gray" />
          <KpiCard label="Joined"        value={stats?.joined        ?? 0} color="gold" />
          <KpiCard label="Active"        value={stats?.active        ?? 0} color="green" />
          <KpiCard label="Completed"     value={stats?.completed     ?? 0} color="blue" />
          <KpiCard label="Disqualified"  value={stats?.disqualified  ?? 0} color="red" />
        </section>

        {/* Quick nav */}
        <section className="mb-8 flex flex-wrap gap-2">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] transition hover:border-[#2E0BFC] hover:text-[#2E0BFC]"
            >
              {label} →
            </Link>
          ))}
        </section>

        {/* Session controls */}
        <section className="mb-8">
          <SessionControls candidates={candidates} />
        </section>

        {/* Candidates */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#0F172A]">Candidates</h2>
            <span className="text-xs text-[#64748B]">Live · refreshes every 3 s</span>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            {loadError ? (
              <p className="text-sm text-red-500">{loadError}</p>
            ) : (
              <CandidateGrid candidates={candidates} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
