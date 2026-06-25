"use client";

import React, { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  type: "mcq" | "psychometric" | "rating" | "image";
  text: string;
  imageUrl: string | null;
  options: unknown;
  correctOption: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}

interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  disqualifyReason: string | null;
  tabSwitchCount: number;
  generatedPassword: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  joinToken: string;
  scheduledAt: string | null;
  autoStart: boolean;
  durationSec: number;
  logoUrl: string | null;
  bgColor: string;
  maxCandidates: number | null;
  negativeMarking: boolean;
  negativeMarkingValue: number;
  gracePeriodMin: number;
  disqualifyOnDuplicateLogin: boolean;
  createdAt: string;
  questions: Question[];
  _count: { candidates: number; questions: number };
}

interface ImportCredential {
  name: string;
  accessId: string;
  email: string;
  password: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

function parseCSV(text: string): { name: string; email: string }[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const nameIdx = header.indexOf("name");
  const emailIdx = header.indexOf("email");
  if (nameIdx === -1 || emailIdx === -1) return [];
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { name: cols[nameIdx] ?? "", email: cols[emailIdx] ?? "" };
    })
    .filter((r) => r.name && r.email);
}

async function downloadExcel(credentials: ImportCredential[], filename: string) {
  // Dynamic import so ExcelJS only loads client-side when needed
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Credentials");
  ws.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Access ID", key: "accessId", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Password", key: "password", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  credentials.forEach((c) => ws.addRow(c));
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared micro-components ────────────────────────────────────────────────

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
          {label}
        </>
      )}
    </button>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#F1F5F9] text-[#64748B]",
  SCHEDULED: "bg-blue-50 text-blue-700",
  LIVE: "bg-green-50 text-green-700",
  PAUSED: "bg-amber-50 text-amber-700",
  ENDED: "bg-red-50 text-red-700",
};

const CANDIDATE_STATUS_STYLES: Record<string, string> = {
  REGISTERED: "bg-gray-100 text-gray-600",
  JOINED: "bg-blue-50 text-blue-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-indigo-50 text-indigo-700",
  DISQUALIFIED: "bg-red-50 text-red-600",
};

// ─── OverviewTab ─────────────────────────────────────────────────────────────

function OverviewTab({
  campaign,
  onSaved,
}: {
  campaign: Campaign;
  onSaved: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [logoUrl, setLogoUrl] = useState(campaign.logoUrl ?? "");
  const [bgColor, setBgColor] = useState(campaign.bgColor ?? "#F8FAFC");
  const [scheduledAt, setScheduledAt] = useState(
    campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : ""
  );
  const [autoStart, setAutoStart] = useState(campaign.autoStart);
  const [maxCandidates, setMaxCandidates] = useState(
    campaign.maxCandidates?.toString() ?? ""
  );
  const [negativeMarking, setNegativeMarking] = useState(campaign.negativeMarking);
  const [negativeMarkingValue, setNegativeMarkingValue] = useState(
    campaign.negativeMarkingValue.toString()
  );
  const [gracePeriodMin, setGracePeriodMin] = useState(campaign.gracePeriodMin);
  const [disqualifyOnDuplicateLogin, setDisqualifyOnDuplicateLogin] = useState(campaign.disqualifyOnDuplicateLogin);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Sync form when campaign changes (e.g. after reload)
  useEffect(() => {
    setName(campaign.name);
    setLogoUrl(campaign.logoUrl ?? "");
    setBgColor(campaign.bgColor ?? "#F8FAFC");
    setScheduledAt(campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : "");
    setAutoStart(campaign.autoStart);
    setMaxCandidates(campaign.maxCandidates?.toString() ?? "");
    setNegativeMarking(campaign.negativeMarking);
    setNegativeMarkingValue(campaign.negativeMarkingValue.toString());
    setGracePeriodMin(campaign.gracePeriodMin);
    setDisqualifyOnDuplicateLogin(campaign.disqualifyOnDuplicateLogin);
  }, [campaign]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          logoUrl: logoUrl.trim() || null,
          bgColor: bgColor.trim() || "#F8FAFC",
          scheduledAt: scheduledAt || null,
          autoStart,
          maxCandidates: maxCandidates ? Number(maxCandidates) : null,
          negativeMarking,
          negativeMarkingValue: Number(negativeMarkingValue),
          gracePeriodMin,
          disqualifyOnDuplicateLogin,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? "Failed to save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayMinutes: 0 }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? "Failed to deploy campaign");
        return;
      }
      window.location.href = "/admin/session";
    } finally {
      setDeploying(false);
    }
  }

  async function handleDelete() {
    await fetch(`/api/admin/campaigns/${campaign.id}`, { method: "DELETE" });
    window.location.href = "/admin/campaigns";
  }

  const joinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${campaign.joinToken}`
      : `/join/${campaign.joinToken}`;

  return (
    <div className="space-y-6">
      {/* Deploy banner — only shown while campaign is DRAFT */}
      {campaign.status === "DRAFT" && (
        <section className="rounded-2xl border border-[#6366F1]/30 bg-gradient-to-br from-[#6366F1]/5 to-indigo-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">Ready to go live?</h2>
              <p className="mt-1 text-sm text-[#64748B]">
                Deploy this campaign to make it live. You can pause, resume, or end it any time from the Live Session page.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="shrink-0 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4F46E5] disabled:opacity-60 transition-colors"
            >
              {deploying ? "Deploying…" : "Deploy Campaign"}
            </button>
          </div>
        </section>
      )}

      {/* Join link */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[#0F172A]">Candidate join link</h2>
        <div className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <p className="flex-1 truncate font-mono text-sm text-[#6366F1]">{joinLink}</p>
          <CopyButton text={joinLink} />
        </div>
        <p className="mt-2 text-xs text-[#64748B]">
          Share this link with candidates. They can log in using their Access ID and password.
        </p>
      </section>

      {/* Settings form */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-[#0F172A]">Campaign settings</h2>
        <form onSubmit={handleSave} className="space-y-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Campaign name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10"
            />
          </div>

          {/* Logo + BgColor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Logo URL</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Background colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-9 w-10 cursor-pointer rounded border border-[#E2E8F0] bg-white p-0.5"
                />
                <input
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
            </div>
          </div>

          {/* Scheduled + Max Candidates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Scheduled start
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Max candidates
              </label>
              <input
                type="number"
                min={1}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Auto-start</p>
                <p className="text-xs text-[#64748B]">
                  Campaign starts automatically at the scheduled time
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoStart}
                onClick={() => setAutoStart((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  autoStart ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    autoStart ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Negative marking</p>
                <p className="text-xs text-[#64748B]">Deduct points for wrong answers</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={negativeMarking}
                onClick={() => setNegativeMarking((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  negativeMarking ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    negativeMarking ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            {negativeMarking && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Deduction fraction (e.g. 0.25 = ¼ of base points)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={negativeMarkingValue}
                  onChange={(e) => setNegativeMarkingValue(e.target.value)}
                  className="w-40 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
            )}
          </div>

          {/* Duplicate login */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">Disqualify on duplicate login</p>
              <p className="text-xs text-[#64748B]">
                If a candidate logs in from a second device, disqualify them and end both sessions.
                When off, the second device is simply blocked.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={disqualifyOnDuplicateLogin}
              onClick={() => setDisqualifyOnDuplicateLogin((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                disqualifyOnDuplicateLogin ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  disqualifyOnDuplicateLogin ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          {/* Candidate entry grace period */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Candidate entry grace period
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              How long after the assessment starts candidates can still join. Set to 0 to allow no late entry.
            </p>
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15, 20, 30, 60].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setGracePeriodMin(min)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    gracePeriodMin === min
                      ? "border-[#6366F1] bg-[#6366F1] text-white"
                      : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                  }`}
                >
                  {min === 0 ? "No late entry" : `${min} min`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </section>

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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[#0F172A]">
              Delete <strong>{campaign.name}</strong>? This cannot be undone.
            </p>
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
  );
}

// ─── QuestionsTab ─────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: "mcq", label: "MCQ" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Image MCQ" },
] as const;

function QuestionsTab({
  campaignId,
  questions,
  durationSec,
  negativeMarking,
  onChanged,
}: {
  campaignId: string;
  questions: Question[];
  durationSec: number;
  negativeMarking: boolean;
  onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // Add form state
  const [qType, setQType] = useState<"mcq" | "psychometric" | "rating" | "image">("mcq");
  const [qText, setQText] = useState("");
  const [qImageUrl, setQImageUrl] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState<number>(0);
  const [qTime, setQTime] = useState("60");
  const [qPoints, setQPoints] = useState("10");
  const [qSpeedBonus, setQSpeedBonus] = useState("0");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const needsOptions = qType === "mcq" || qType === "image";

  function setOption(index: number, value: string) {
    setQOptions((prev) => { const next = [...prev]; next[index] = value; return next; });
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (needsOptions && qOptions.some((o) => !o.trim())) {
      setAddError("All options must be filled in.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: qType,
          text: qText.trim(),
          imageUrl: qImageUrl.trim() || null,
          options: needsOptions ? qOptions : [],
          correctOption: needsOptions ? qCorrect : null,
          timeLimitSec: Number(qTime),
          basePoints: Number(qPoints),
          speedBonusMax: Number(qSpeedBonus),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAddError(d.error ?? "Failed to add question");
        return;
      }
      // Reset form
      setQText("");
      setQImageUrl("");
      setQOptions(["", "", "", ""]);
      setQCorrect(0);
      setQTime("60");
      setQPoints("10");
      setQSpeedBonus("0");
      setShowAdd(false);
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(qId: string) {
    if (!confirm("Delete this question?")) return;
    setDeleting(qId);
    await fetch(`/api/admin/questions/${qId}`, { method: "DELETE" });
    setDeleting(null);
    onChanged();
  }

  async function handleMoveUp(q: Question) {
    if (q.orderIndex === 0) return;
    setReordering(true);
    await fetch("/api/admin/questions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, newIndex: q.orderIndex - 1 }),
    });
    setReordering(false);
    onChanged();
  }

  async function handleMoveDown(q: Question, total: number) {
    if (q.orderIndex >= total - 1) return;
    setReordering(true);
    await fetch("/api/admin/questions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, newIndex: q.orderIndex + 1 }),
    });
    setReordering(false);
    onChanged();
  }

  return (
    <div className="space-y-6">
      {/* Duration banner */}
      {durationSec > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <svg className="h-4 w-4 text-[#6366F1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-[#0F172A]">
            <span className="font-semibold">Total assessment time:</span>{" "}
            {formatDuration(durationSec)}
          </p>
        </div>
      )}

      {/* Question list */}
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center">
          <p className="text-sm text-[#64748B]">No questions yet. Add your first question below.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
          <div className="border-b border-[#E2E8F0] px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0F172A]">
              {questions.length} question{questions.length !== 1 ? "s" : ""}
            </h2>
          </div>
          <ul className="divide-y divide-[#E2E8F0]">
            {questions.map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-5 py-4">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <button
                    type="button"
                    disabled={reordering || q.orderIndex === 0}
                    onClick={() => handleMoveUp(q)}
                    className="rounded p-0.5 text-[#94A3B8] hover:bg-[#F1F5F9] disabled:opacity-30"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={reordering || q.orderIndex >= questions.length - 1}
                    onClick={() => handleMoveDown(q, questions.length)}
                    className="rounded p-0.5 text-[#94A3B8] hover:bg-[#F1F5F9] disabled:opacity-30"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
                      {q.type}
                    </span>
                    {negativeMarking && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        −marking
                      </span>
                    )}
                    <span className="text-xs text-[#94A3B8]">
                      {formatDuration(q.timeLimitSec)} · {q.basePoints} pts
                      {q.speedBonusMax > 0 && ` · +${q.speedBonusMax} speed`}
                    </span>
                  </div>
                  <p className="text-sm text-[#0F172A] line-clamp-2 leading-snug">{q.text}</p>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  disabled={deleting === q.id}
                  className="shrink-0 rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"
                  title="Delete question"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add question */}
      {!showAdd ? (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[#E2E8F0] px-5 py-3 text-sm font-medium text-[#6366F1] hover:border-[#6366F1] hover:bg-indigo-50/30 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add question
        </button>
      ) : (
        <section className="rounded-2xl border border-[#6366F1]/30 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-[#0F172A]">New question</h3>
          <form onSubmit={handleAddQuestion} className="space-y-4">
            {/* Question type buttons */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Question type</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setQType(t.value as typeof qType)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      qType === t.value
                        ? "border-[#6366F1] bg-[#6366F1] text-white"
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question text */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Question text</label>
              <textarea
                required
                rows={3}
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="Enter question text…"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] resize-none"
              />
            </div>

            {/* Image URL — image MCQ only */}
            {qType === "image" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Image URL</label>
                <input
                  type="url"
                  value={qImageUrl}
                  onChange={(e) => setQImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
                />
              </div>
            )}

            {/* Options — MCQ and Image MCQ */}
            {needsOptions && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Options</label>
                <div className="space-y-2">
                  {qOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F1F5F9] text-xs font-semibold text-[#64748B]">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        required
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Correct answer selector */}
            {needsOptions && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Correct answer</label>
                <div className="flex gap-2">
                  {qOptions.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQCorrect(i)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        qCorrect === i
                          ? "bg-[#6366F1] text-white"
                          : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1]"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(qType === "psychometric" || qType === "rating") && (
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question type always awards base points on any answer — there is no wrong answer.
              </p>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Time limit (sec)
                </label>
                <input
                  required
                  type="number"
                  min={5}
                  value={qTime}
                  onChange={(e) => setQTime(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Base points
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={qPoints}
                  onChange={(e) => setQPoints(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Speed bonus max
                </label>
                <input
                  type="number"
                  min={0}
                  value={qSpeedBonus}
                  onChange={(e) => setQSpeedBonus(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
            </div>

            {addError && (
              <p className="text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                {addError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setAddError(""); }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add question"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

// ─── CandidatesTab ────────────────────────────────────────────────────────────

function CandidatesTab({
  campaignId,
  campaignName,
  candidates,
  onChanged,
}: {
  campaignId: string;
  campaignName: string;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  // Revealed passwords panel
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Manual add
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualAdding, setManualAdding] = useState(false);
  const [manualCred, setManualCred] = useState<{ accessId: string; password: string } | null>(null);
  const [manualError, setManualError] = useState("");

  // CSV import
  const [importRows, setImportRows] = useState<{ name: string; email: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    credentials: ImportCredential[];
  } | null>(null);
  const [importError, setImportError] = useState("");

  // Single remove
  const [removing, setRemoving] = useState<string | null>(null);

  // Bulk remove all
  const [removeAllConfirm, setRemoveAllConfirm] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setManualError("");
    setManualCred(null);
    setManualAdding(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: manualName.trim(), email: manualEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualError(data.error ?? "Failed to add candidate");
        return;
      }
      setManualCred({ accessId: data.candidate.accessId, password: data.password });
      setManualName("");
      setManualEmail("");
      onChanged();
    } finally {
      setManualAdding(false);
    }
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
      setImportError("");
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handleImport() {
    if (!importRows.length) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/candidates/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed");
        return;
      }
      setImportResult(data);
      setImportRows([]);
      onChanged();
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(candidateId: string) {
    if (!confirm("Remove this candidate?")) return;
    setRemoving(candidateId);
    await fetch(`/api/admin/campaigns/${campaignId}/candidates/${candidateId}`, {
      method: "DELETE",
    });
    setRemoving(null);
    onChanged();
  }

  async function handleRemoveAll() {
    setRemovingAll(true);
    try {
      await Promise.all(
        candidates.map((c) =>
          fetch(`/api/admin/campaigns/${campaignId}/candidates/${c.id}`, {
            method: "DELETE",
          })
        )
      );
      setRemoveAllConfirm(false);
      onChanged();
    } finally {
      setRemovingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Add manually ── */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-[#0F172A]">Add candidate manually</h2>
        <form onSubmit={handleManualAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Name</label>
            <input
              required
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">Email</label>
            <input
              required
              type="email"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
            />
          </div>
          <button
            type="submit"
            disabled={manualAdding}
            className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
          >
            {manualAdding ? "Adding…" : "Add"}
          </button>
        </form>

        {manualError && (
          <p className="mt-3 text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            {manualError}
          </p>
        )}

        {manualCred && (
          <div className="mt-4 rounded-xl border border-[#6366F1]/20 bg-indigo-50 p-4 space-y-2">
            <p className="text-xs font-semibold text-[#6366F1] mb-3">
              One-time credentials — save these now
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#0F172A] w-20 shrink-0">Access ID</span>
              <code className="flex-1 rounded bg-white border border-[#E2E8F0] px-2.5 py-1 text-sm font-mono text-[#0F172A]">
                {manualCred.accessId}
              </code>
              <CopyButton text={manualCred.accessId} label="Copy" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#0F172A] w-20 shrink-0">Password</span>
              <code className="flex-1 rounded bg-white border border-[#E2E8F0] px-2.5 py-1 text-sm font-mono text-[#0F172A]">
                {manualCred.password}
              </code>
              <CopyButton text={manualCred.password} label="Copy" />
            </div>
            <button
              type="button"
              onClick={() => setManualCred(null)}
              className="mt-2 text-xs text-[#64748B] hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* ── CSV import ── */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Bulk import via CSV</h2>
            <p className="mt-0.5 text-xs text-[#64748B]">
              Columns required: <code className="font-mono">name, email</code>
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E2E8F0] bg-[#F8FAFC] py-8 text-center hover:border-[#6366F1] hover:bg-indigo-50/30 transition-colors">
          <svg className="mb-2 h-7 w-7 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm font-medium text-[#0F172A]">Click to upload CSV</span>
          <span className="mt-0.5 text-xs text-[#64748B]">name, email columns required</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
        </label>

        {importRows.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-[#0F172A]">
                {importRows.length} row{importRows.length !== 1 ? "s" : ""} parsed
              </p>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-[#6366F1] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4F46E5] disabled:opacity-60"
              >
                {importing ? "Importing…" : `Import ${importRows.length}`}
              </button>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {importRows.slice(0, 5).map((r, i) => (
                <p key={i} className="text-xs text-[#64748B]">
                  {r.name} · {r.email}
                </p>
              ))}
              {importRows.length > 5 && (
                <p className="text-xs text-[#64748B]">…and {importRows.length - 5} more</p>
              )}
            </div>
          </div>
        )}

        {importError && (
          <p className="mt-3 text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            {importError}
          </p>
        )}

        {importResult && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <svg className="h-5 w-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <p className="text-sm text-emerald-700 flex-1">
              <span className="font-semibold">{importResult.imported}</span> candidate
              {importResult.imported !== 1 ? "s" : ""} imported
            </p>
            {importResult.credentials.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadExcel(
                    importResult.credentials,
                    `credentials-${campaignName.toLowerCase().replace(/\s+/g, "-")}.xlsx`
                  )
                }
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Excel
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Candidate table ── */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
        <div className="border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0F172A]">
            {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
          </h2>
          <div className="flex items-center gap-2">
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadExcel(
                    candidates.map((c) => ({
                      name: c.name,
                      accessId: c.accessId,
                      email: c.email,
                      password: c.generatedPassword ?? "—",
                    })),
                    `credentials-${campaignName.toLowerCase().replace(/\s+/g, "-")}.xlsx`
                  )
                }
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download credentials
              </button>
            )}
            {candidates.length > 0 && !removeAllConfirm && (
              <button
                type="button"
                onClick={() => setRemoveAllConfirm(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
              >
                Remove all
              </button>
            )}
            {removeAllConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B]">Remove all {candidates.length}?</span>
                <button
                  type="button"
                  onClick={handleRemoveAll}
                  disabled={removingAll}
                  className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {removingAll ? "Removing…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveAllConfirm(false)}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-1 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#64748B]">No candidates yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  <th className="px-5 py-3 text-left">Access ID</th>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Password</th>
                  <th className="px-5 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`border-b border-[#E2E8F0] ${i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}`}
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-[#0F172A]">
                        {c.accessId}
                      </td>
                      <td className="px-5 py-3 text-[#0F172A]">{c.name}</td>
                      <td className="px-5 py-3 text-[#64748B]">{c.email}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            CANDIDATE_STATUS_STYLES[c.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {c.generatedPassword ? (
                          <button
                            type="button"
                            onClick={() => toggleReveal(c.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                              revealedIds.has(c.id)
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            {revealedIds.has(c.id) ? "Hide" : "Reveal"}
                          </button>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(c.id)}
                          disabled={removing === c.id}
                          className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"
                          title="Remove candidate"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    {revealedIds.has(c.id) && c.generatedPassword && (
                      <tr key={`${c.id}-reveal`} className={i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}>
                        <td colSpan={6} className="px-5 pb-3">
                          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
                            <svg className="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            <code className="flex-1 font-mono text-sm text-amber-900">
                              {c.generatedPassword}
                            </code>
                            <CopyButton text={c.generatedPassword} label="Copy" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tab, setTab] = useState<"overview" | "questions" | "candidates">("overview");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const fetchCampaign = useCallback(async () => {
    const res = await fetch(`/api/admin/campaigns/${id}`);
    const data = await res.json();
    if (data.campaign) setCampaign(data.campaign);
  }, [id]);

  const fetchCandidates = useCallback(async () => {
    const res = await fetch(`/api/admin/campaigns/${id}/candidates`);
    const data = await res.json();
    setCandidates(data.candidates ?? []);
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    if (tab === "candidates") fetchCandidates();
  }, [tab, fetchCandidates]);

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6366F1] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/campaigns"
              className="text-xs text-[#64748B] hover:text-[#0F172A]"
            >
              ← Campaigns
            </Link>
          </div>
          <h1 className="text-xl font-bold text-[#0F172A]">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[#64748B]">Join token:</span>
            <code className="text-xs bg-[#F1F5F9] rounded px-1.5 py-0.5 text-[#6366F1]">
              {campaign.joinToken}
            </code>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            STATUS_STYLES[campaign.status] ?? "bg-[#F1F5F9] text-[#64748B]"
          }`}
        >
          {campaign.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] mb-6">
        {(["overview", "questions", "candidates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[#6366F1] text-[#6366F1]"
                : "border-transparent text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            {t === "candidates" && `Candidates (${campaign._count?.candidates ?? 0})`}
            {t === "questions" && `Questions (${campaign._count?.questions ?? 0})`}
            {t === "overview" && "Overview"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab campaign={campaign} onSaved={fetchCampaign} />
      )}
      {tab === "questions" && (
        <QuestionsTab
          campaignId={id}
          questions={campaign.questions ?? []}
          durationSec={campaign.durationSec}
          negativeMarking={campaign.negativeMarking}
          onChanged={fetchCampaign}
        />
      )}
      {tab === "candidates" && (
        <CandidatesTab
          campaignId={id}
          campaignName={campaign.name}
          candidates={candidates}
          onChanged={fetchCandidates}
        />
      )}
    </div>
  );
}
