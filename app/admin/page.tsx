// app/admin/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
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

  // Initial load + polling every 3s. Stats only needs counts, but the
  // candidate list also needs to be polled — handlers.ts only emits
  // candidate:event on disqualify, not on join/status changes (that path
  // doesn't write to the DB), so this is how JOINED/ACTIVE reach the grid.
  useEffect(() => {
    fetchStats();
    fetchCandidates();
    const interval = setInterval(() => {
      fetchStats();
      fetchCandidates();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCandidates]);

  // Live socket updates — candidate:event carries the single changed
  // candidate's new state, stats:update just means "go refetch stats now"
  // rather than carrying the payload itself (see handlers.ts).
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
    <main className="min-h-screen bg-gray-900 p-6 text-gray-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PreCognise Admin</h1>
            <p className="text-sm text-gray-500">Demo Mode</p>
          </div>
          <UserButton />
        </header>

        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <KpiCard label="Registered" value={stats?.registered ?? 0} color="gray" />
          <KpiCard label="Joined" value={stats?.joined ?? 0} color="gold" />
          <KpiCard label="Active" value={stats?.active ?? 0} color="green" />
          <KpiCard label="Completed" value={stats?.completed ?? 0} color="blue" />
          <KpiCard label="Disqualified" value={stats?.disqualified ?? 0} color="red" />
        </section>

        <section className="mb-6">
          <SessionControls candidates={candidates} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-300">
            Candidates
          </h2>
          {loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : (
            <CandidateGrid candidates={candidates} />
          )}
        </section>
      </div>
    </main>
  );
}