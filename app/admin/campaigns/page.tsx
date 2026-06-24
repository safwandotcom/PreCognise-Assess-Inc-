"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[#F1F5F9] text-[#64748B]",
  SCHEDULED: "bg-blue-50 text-blue-700",
  LIVE: "bg-green-50 text-green-700",
  PAUSED: "bg-amber-50 text-amber-700",
  ENDED: "bg-red-50 text-red-700",
};

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  durationSec: number;
  _count: { candidates: number; questions: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/campaigns")
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []));
  }, []);

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Delete campaign "${name}" and all its data? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
    setCampaigns(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  }

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#0F172A]">Campaigns</h1>
        <Link
          href="/admin/campaigns/new"
          className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white"
        >
          + New Campaign
        </Link>
      </div>

      {campaigns.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] p-12 text-center">
          <p className="text-[#64748B] mb-4">No campaigns yet.</p>
          <Link href="/admin/campaigns/new" className="text-[#6366F1] font-medium">
            Create your first campaign →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div key={c.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <h2 className="font-semibold text-[#0F172A] text-sm leading-snug">{c.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                {c.status}
              </span>
            </div>
            {c.scheduledAt && (
              <p className="text-xs text-[#64748B] mb-1">
                Scheduled: {new Date(c.scheduledAt).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-[#64748B] mb-1">
              {c._count.candidates} candidates · {c._count.questions} questions · {formatDuration(c.durationSec)}
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href={`/admin/campaigns/${c.id}`}
                className="flex-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] py-1.5 text-center text-xs font-medium text-[#0F172A]"
              >
                Manage →
              </Link>
              <button
                onClick={() => deleteCampaign(c.id, c.name)}
                disabled={deleting === c.id}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
