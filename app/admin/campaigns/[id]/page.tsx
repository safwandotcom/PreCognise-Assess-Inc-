"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { slugify } from "@/lib/slugify";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  country: string | null;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  expiresAt: string | null;
  maxCandidates: number | null;
  createdAt: string;
  _count: { candidates: number };
  candidates: Candidate[];
}

interface ImportedCandidate {
  rollNumber: string;
  name: string;
  email: string;
  password: string;
}

// ─── CSV helpers ────────────────────────────────────────────────────────────

function parseCSV(text: string): { name: string; email: string; country?: string }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect header
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const nameIdx = header.indexOf("name");
  const emailIdx = header.indexOf("email");
  const countryIdx = header.indexOf("country");

  if (nameIdx === -1 || emailIdx === -1) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      name: cols[nameIdx] ?? "",
      email: cols[emailIdx] ?? "",
      country: countryIdx >= 0 ? (cols[countryIdx] ?? "") : undefined,
    };
  }).filter((r) => r.name && r.email);
}

const CSV_TEMPLATE = `name,email,country
Jane Smith,jane@example.com,Canada
John Doe,john@example.com,`;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "candidate-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
    >
      {copied ? (
        <><svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg> Copied</>
      ) : (
        <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg> {label}</>
      )}
    </button>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  REGISTERED: "bg-gray-100 text-gray-600",
  JOINED:     "bg-blue-50 text-blue-600",
  ACTIVE:     "bg-emerald-50 text-emerald-700",
  COMPLETED:  "bg-indigo-50 text-indigo-700",
  DISQUALIFIED: "bg-red-50 text-red-600",
};

// ─── Main page ──────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editMax, setEditMax] = useState("");

  // Import state
  const [importRows, setImportRows] = useState<{ name: string; email: string; country?: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: ImportedCandidate[];
    skipped: string[];
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`);
      const data = await res.json();
      setCampaign(data.campaign);
      setEditName(data.campaign.name);
      setEditSlug(data.campaign.slug);
      setEditExpiry(data.campaign.expiresAt ? data.campaign.expiresAt.slice(0, 16) : "");
      setEditMax(data.campaign.maxCandidates?.toString() ?? "");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const editDirty = !!campaign && (
    editName !== campaign.name ||
    editSlug !== campaign.slug ||
    editExpiry !== (campaign.expiresAt ? campaign.expiresAt.slice(0, 16) : "") ||
    editMax !== (campaign.maxCandidates?.toString() ?? "")
  );

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          slug: slugify(editSlug),
          active: campaign.active,
          expiresAt: editExpiry || null,
          maxCandidates: editMax ? Number(editMax) : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to save");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!campaign) return;
    await fetch(`/api/admin/campaigns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaign.name,
        slug: campaign.slug,
        active: !campaign.active,
        expiresAt: campaign.expiresAt,
        maxCandidates: campaign.maxCandidates,
      }),
    });
    await load();
  }

  async function handleDelete() {
    await fetch(`/api/admin/campaigns/${id}`, { method: "DELETE" });
    window.location.href = "/admin/campaigns";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setImportRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      setImportResult(data);
      setImportRows([]);
      await load();
    } catch {
      alert("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  function downloadCredentials(candidates: ImportedCandidate[]) {
    const lines = ["Roll Number,Name,Email,Password", ...candidates.map((c) =>
      `${c.rollNumber},${c.name},${c.email},${c.password}`
    )];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-${campaign?.slug ?? "import"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#2E0BFC] border-t-transparent" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
        <p className="font-semibold text-[#0F172A]">Campaign not found</p>
        <Link href="/admin/campaigns" className="text-sm text-[#2E0BFC] hover:underline">← Back to campaigns</Link>
      </div>
    );
  }

  const applyUrl = `${getBaseUrl()}/apply/${campaign.slug}`;

  return (
    <div className="px-7 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#0F172A]">{campaign.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
            campaign.active
              ? "bg-green-50 text-green-700"
              : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
          }`}>
            {campaign.active ? "Active" : "Inactive"}
          </span>
        </div>
        <button
          onClick={handleToggleActive}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            campaign.active
              ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              : "text-white hover:opacity-90"
          }`}
          style={campaign.active ? undefined : { background: "linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)" }}
        >
          {campaign.active ? "Deactivate" : "Activate"}
        </button>
      </div>

      <div className="space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Registered", value: campaign._count.candidates },
            { label: "Capacity", value: campaign.maxCandidates ?? "∞" },
            { label: "Expires", value: campaign.expiresAt ? new Date(campaign.expiresAt).toLocaleDateString() : "Never" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">{label}</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">{value}</p>
            </div>
          ))}
        </div>

        {/* Apply link */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[#0F172A]">Registration link</h2>
          <div className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="flex-1 truncate font-mono text-sm text-[#2E0BFC]">{applyUrl}</p>
            <CopyButton text={applyUrl} />
          </div>
          <p className="mt-2 text-xs text-[#64748B]">Share this link with candidates. They can register directly.</p>
        </section>

        {/* Edit */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-[#0F172A]">Campaign settings</h2>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Name</label>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#2E0BFC] focus:ring-2 focus:ring-[#2E0BFC]/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Slug</label>
                <div className="flex items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white focus-within:border-[#2E0BFC]">
                  <span className="select-none border-r border-[#E2E8F0] bg-[#F1F5F9] px-2.5 py-2 text-xs text-[#64748B]">/apply/</span>
                  <input
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    className="flex-1 bg-transparent px-2.5 py-2 text-sm text-[#0F172A] outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Expires at</label>
                <input
                  type="datetime-local"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#2E0BFC]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Max candidates</label>
                <input
                  type="number"
                  min={1}
                  value={editMax}
                  onChange={(e) => setEditMax(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#64748B] outline-none focus:border-[#2E0BFC]"
                />
              </div>
            </div>

            {editDirty && (
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={load}
                  className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#2E0BFC] px-5 py-2 text-sm font-medium text-white hover:bg-[#1E06B8] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* CSV import */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">CSV import</h2>
              <p className="mt-0.5 text-xs text-[#64748B]">Bulk-add candidates. Roll numbers and temp passwords are generated automatically.</p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Template CSV
            </button>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] py-8 text-center hover:border-[#2E0BFC] hover:bg-indigo-50/30">
            <svg className="mb-2 h-7 w-7 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-medium text-[#0F172A]">Click to upload CSV</span>
            <span className="mt-0.5 text-xs text-[#64748B]">Columns: name, email, country (optional)</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
          </label>

          {importRows.length > 0 && (
            <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-[#0F172A]">{importRows.length} row{importRows.length !== 1 ? "s" : ""} parsed</p>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="rounded-lg bg-[#2E0BFC] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1E06B8] disabled:opacity-60"
                >
                  {importing ? "Importing…" : `Import ${importRows.length} candidates`}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {importRows.slice(0, 5).map((r, i) => (
                  <p key={i} className="text-xs text-[#64748B]">{r.name} · {r.email}</p>
                ))}
                {importRows.length > 5 && <p className="text-xs text-[#64748B]">…and {importRows.length - 5} more</p>}
              </div>
            </div>
          )}

          {importResult && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <p className="text-sm text-emerald-700">
                  <span className="font-semibold">{importResult.created.length}</span> candidate{importResult.created.length !== 1 ? "s" : ""} imported
                  {importResult.skipped.length > 0 && `, ${importResult.skipped.length} skipped`}
                </p>
                {importResult.created.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadCredentials(importResult.created)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Download credentials CSV
                  </button>
                )}
              </div>

              {importResult.skipped.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-amber-700">Skipped</p>
                  {importResult.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-amber-600">{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Candidates table */}
        {campaign.candidates.length > 0 && (
          <section className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="border-b border-[#E2E8F0] px-5 py-4">
              <h2 className="text-sm font-semibold text-[#0F172A]">Registered candidates</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    <th className="px-5 py-3 text-left">Roll #</th>
                    <th className="px-5 py-3 text-left">Name</th>
                    <th className="px-5 py-3 text-left">Email</th>
                    <th className="px-5 py-3 text-left">Country</th>
                    <th className="px-5 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.candidates.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-b border-[#E2E8F0] last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}`}
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-[#0F172A]">{c.rollNumber}</td>
                      <td className="px-5 py-3 text-[#0F172A]">{c.name}</td>
                      <td className="px-5 py-3 text-[#64748B]">{c.email}</td>
                      <td className="px-5 py-3 text-[#64748B]">{c.country ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ""}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Danger zone */}
        <section className="rounded-2xl border border-red-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-red-600">Danger zone</h2>
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete campaign
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-[#0F172A]">Delete <strong>{campaign.name}</strong>? This cannot be undone.</p>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
