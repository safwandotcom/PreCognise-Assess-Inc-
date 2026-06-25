"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = ["Details & Branding", "Schedule & Settings", "Questions", "Candidates"];

interface CampaignDraft {
  name: string;
  logoUrl: string;
  bgColor: string;
  scheduledAt: string;
  autoStart: boolean;
  maxCandidates: string;
  negativeMarking: boolean;
  negativeMarkingValue: string;
}

const INITIAL: CampaignDraft = {
  name: "",
  logoUrl: "",
  bgColor: "#F8FAFC",
  scheduledAt: "",
  autoStart: false,
  maxCandidates: "",
  negativeMarking: false,
  negativeMarkingValue: "0.25",
};

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CampaignDraft>(INITIAL);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof CampaignDraft, value: string | boolean) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function saveStep1() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          logoUrl: draft.logoUrl || null,
          bgColor: draft.bgColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setCampaignId(data.campaign.id);
      setStep(1);
    } finally {
      setSaving(false);
    }
  }

  async function saveStep2() {
    if (!campaignId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: draft.scheduledAt || null,
          autoStart: draft.autoStart,
          maxCandidates: draft.maxCandidates ? parseInt(draft.maxCandidates) : null,
          negativeMarking: draft.negativeMarking,
          negativeMarkingValue: parseFloat(draft.negativeMarkingValue),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setStep(2);
    } finally {
      setSaving(false);
    }
  }

  if (!campaignId && step > 0) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-[#6366F1] text-white" : "bg-[#E2E8F0] text-[#64748B]"}`}>
              {i + 1}
            </div>
            <span className={`text-xs ${i === step ? "font-semibold text-[#0F172A]" : "text-[#64748B]"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="text-[#E2E8F0]">›</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Details & Branding */}
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[#0F172A]">Details &amp; Branding</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Campaign Name *</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.name}
              onChange={e => update("name", e.target.value)}
              placeholder="e.g. Relationship Manager Assessment — RBC Canada"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.logoUrl}
              onChange={e => update("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Background Colour</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={draft.bgColor} onChange={e => update("bgColor", e.target.value)} className="h-9 w-12 rounded border border-[#E2E8F0] cursor-pointer" />
              <input
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-mono"
                value={draft.bgColor}
                onChange={e => update("bgColor", e.target.value)}
              />
            </div>
          </div>
          {/* Live preview */}
          <div className="rounded-xl border border-[#E2E8F0] p-4" style={{ backgroundColor: draft.bgColor }}>
            <div className="flex items-center gap-3">
              {draft.logoUrl && <img src={draft.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />}
              <span className="font-semibold text-sm" style={{ color: draft.bgColor === "#F8FAFC" ? "#0F172A" : undefined }}>{draft.name || "Campaign Name"}</span>
            </div>
            <p className="text-xs mt-1 opacity-60">Preview — as candidates will see it</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={saveStep1}
            disabled={!draft.name.trim() || saving}
            className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Next →"}
          </button>
        </div>
      )}

      {/* Step 2: Schedule & Settings */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[#0F172A]">Schedule &amp; Settings</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Start (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledAt}
              onChange={e => update("scheduledAt", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.autoStart} onChange={e => update("autoStart", e.target.checked)} />
            Auto-start at scheduled time
          </label>
          <div>
            <label className="block text-sm font-medium mb-1">Max Candidates</label>
            <input
              type="number"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.maxCandidates}
              onChange={e => update("maxCandidates", e.target.value)}
              placeholder="e.g. 12000"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.negativeMarking} onChange={e => update("negativeMarking", e.target.checked)} />
            Enable negative marking
          </label>
          {draft.negativeMarking && (
            <div>
              <label className="block text-sm font-medium mb-1">Deduction fraction (0.00–1.00)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="w-40 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={draft.negativeMarkingValue}
                onChange={e => update("negativeMarkingValue", e.target.value)}
              />
              <p className="text-xs text-[#64748B] mt-1">Deduct {draft.negativeMarkingValue}× base points per wrong answer</p>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="rounded-lg border border-[#E2E8F0] px-6 py-2 text-sm">← Back</button>
            <button onClick={saveStep2} disabled={saving} className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Next →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Questions (redirect note) */}
      {step === 2 && campaignId && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Questions</h2>
            <span className="text-xs text-[#64748B]">Add questions, then continue to candidates</span>
          </div>
          <p className="text-sm text-[#64748B] mb-4">You can add questions from the Manage page after finishing setup.</p>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="rounded-lg border border-[#E2E8F0] px-6 py-2 text-sm">← Back</button>
            <button onClick={() => setStep(3)} className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white">
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Candidates (redirect note) */}
      {step === 3 && campaignId && (
        <div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Candidates</h2>
          <p className="text-sm text-[#64748B] mb-4">Import candidates from the Manage page, or finish setup now.</p>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-lg border border-[#E2E8F0] px-6 py-2 text-sm">← Back</button>
            <button
              onClick={() => router.push(`/admin/campaigns/${campaignId}`)}
              className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white"
            >
              Go to Campaign →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
