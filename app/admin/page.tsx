"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import KpiCard from "@/components/admin/KpiCard";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";
import { campaignStatusLabel } from "@/lib/labels";

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
  status: string;
  createdAt: string;
  _count: { candidates: number };
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

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

  useEffect(() => {
    fetchStats();
    fetchCampaigns();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCampaigns]);

  useEffect(() => {
    const socket = getAdminSocket();
    socket.emit("admin:join");
    socket.on("stats:update", fetchStats);
    return () => {
      socket.off("stats:update");
      disconnectAdminSocket();
    };
  }, [fetchStats]);

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
      </div>

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
                        c.status === "LIVE"
                          ? "bg-green-50 text-green-700"
                          : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                      }`}>
                        {campaignStatusLabel(c.status)}
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
      </section>

    </div>
  );
}
