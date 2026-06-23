"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { slugify } from "@/lib/slugify";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  expiresAt: string | null;
  maxCandidates: number | null;
  createdAt: string;
  _count: { candidates: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function applyLink(slug: string): string {
  return `${getBaseUrl()}/apply/${slug}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg border border-[#E8E6DF] px-3 py-1.5 text-xs font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}

// ─── Create modal ───────────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  slug: string;
  expiresAt: string;
  maxCandidates: string;
}

function CreateModal({
  onSave,
  onClose,
  saving,
}: {
  onSave: (data: CreateForm) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CreateForm>({ name: "", slug: "", expiresAt: "", maxCandidates: "" });
  const [slugEdited, setSlugEdited] = useState(false);

  function handleNameChange(v: string) {
    setForm((f) => ({
      ...f,
      name: v,
      slug: slugEdited ? f.slug : slugify(v),
    }));
  }

  function handleSlugChange(v: string) {
    setSlugEdited(true);
    setForm((f) => ({ ...f, slug: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E8E6DF] px-6 py-4">
          <h2 className="text-base font-semibold text-[#1A1B23]">New campaign</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#6B6A63] hover:bg-[#F4F3EE]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Campaign name <span className="text-red-500">*</span></label>
            <input
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. EZone Assessment 2026"
              className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Slug (URL path) <span className="text-red-500">*</span></label>
            <div className="flex items-center overflow-hidden rounded-lg border border-[#E8E6DF] bg-white focus-within:border-[#3730A3] focus-within:ring-2 focus-within:ring-[#3730A3]/10">
              <span className="select-none border-r border-[#E8E6DF] bg-[#F4F3EE] px-3 py-2.5 text-sm text-[#6B6A63]">/apply/</span>
              <input
                required
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="ezone-2026"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#1A1B23] outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-[#6B6A63]">Lowercase letters, numbers, hyphens only.</p>
          </div>

          {/* Optional */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Expires at</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Max candidates</label>
              <input
                type="number"
                min={1}
                value={form.maxCandidates}
                onChange={(e) => setForm((f) => ({ ...f, maxCandidates: e.target.value }))}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-[#E8E6DF] pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[#3730A3] px-5 py-2 text-sm font-medium text-white hover:bg-[#2D2785] disabled:opacity-60">
              {saving ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Campaign card ──────────────────────────────────────────────────────────

function CampaignCard({ c, onToggle }: { c: Campaign; onToggle: (id: string, active: boolean) => void }) {
  const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
  const full = c.maxCandidates !== null && c._count.candidates >= c.maxCandidates;

  let statusLabel = "Active";
  let statusClass = "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (!c.active) { statusLabel = "Inactive"; statusClass = "bg-gray-100 text-gray-500 ring-1 ring-gray-200"; }
  else if (expired) { statusLabel = "Expired"; statusClass = "bg-amber-50 text-amber-700 ring-1 ring-amber-200"; }
  else if (full) { statusLabel = "Full"; statusClass = "bg-red-50 text-red-600 ring-1 ring-red-200"; }

  return (
    <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-[#1A1B23]">{c.name}</h3>
            <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-[#6B6A63]">/apply/{c.slug}</p>
        </div>

        <button
          type="button"
          onClick={() => onToggle(c.id, !c.active)}
          className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            c.active
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {c.active ? "Deactivate" : "Activate"}
        </button>
      </div>

      {/* Stats row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#6B6A63]">
        <span>
          <span className="font-semibold text-[#1A1B23]">{c._count.candidates}</span>
          {c.maxCandidates ? ` / ${c.maxCandidates}` : ""} registered
        </span>
        {c.expiresAt && (
          <span>
            Expires {new Date(c.expiresAt).toLocaleDateString()}
          </span>
        )}
        <span className="text-xs">Created {new Date(c.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E8E6DF] pt-4">
        <CopyButton text={applyLink(c.slug)} />
        <Link
          href={`/admin/campaigns/${c.id}`}
          className="rounded-lg border border-[#E8E6DF] px-3 py-1.5 text-xs font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
        >
          Manage →
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {
      setError("Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(form: { name: string; slug: string; expiresAt: string; maxCandidates: string }) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          expiresAt: form.expiresAt || null,
          maxCandidates: form.maxCandidates ? Number(form.maxCandidates) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed to create"); return; }
      setShowCreate(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const c = campaigns.find((x) => x.id === id);
    if (!c) return;
    await fetch(`/api/admin/campaigns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: c.name, slug: c.slug, active, expiresAt: c.expiresAt, maxCandidates: c.maxCandidates }),
    });
    await load();
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#E8E6DF] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link href="/admin" className="text-sm text-[#6B6A63] hover:text-[#1A1B23]">← Admin dashboard</Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1A1B23]">Campaigns</h1>
              <p className="mt-0.5 text-sm text-[#6B6A63]">
                Each campaign has a unique link candidates use to self-register.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-[#3730A3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2D2785]"
            >
              + New campaign
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#3730A3] border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
        )}

        {!loading && !error && campaigns.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E8E6DF] bg-white py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F4F3EE]">
              <svg className="h-7 w-7 text-[#6B6A63]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <p className="font-medium text-[#1A1B23]">No campaigns yet</p>
            <p className="mt-1 text-sm text-[#6B6A63]">Create a campaign to get a shareable registration link.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 rounded-lg bg-[#3730A3] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2D2785]"
            >
              Create first campaign
            </button>
          </div>
        )}

        {!loading && !error && campaigns.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} c={c} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal onSave={handleCreate} onClose={() => setShowCreate(false)} saving={saving} />
      )}
    </main>
  );
}
