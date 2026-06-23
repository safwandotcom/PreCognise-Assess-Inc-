"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BrandingForm {
  orgName: string;
  tagline: string;
  logoUrl: string;
  primaryColour: string;
}

const DEFAULTS: BrandingForm = {
  orgName: "PreCognise",
  tagline: "Candidate Assessment",
  logoUrl: "",
  primaryColour: "#3730A3",
};

const PRESET_COLOURS = [
  { label: "Indigo",    value: "#3730A3" },
  { label: "Violet",   value: "#7C3AED" },
  { label: "Rose",     value: "#E11D48" },
  { label: "Emerald",  value: "#059669" },
  { label: "Amber",    value: "#D97706" },
  { label: "Sky",      value: "#0284C7" },
  { label: "Slate",    value: "#475569" },
  { label: "Zinc",     value: "#18181B" },
];

// ─── Candidate login preview ────────────────────────────────────────────────

function LoginPreview({ form }: { form: BrandingForm }) {
  const col = form.primaryColour || "#3730A3";

  return (
    <div
      className="flex min-h-[480px] flex-col items-center justify-center bg-gray-900 px-8"
      style={{ fontFamily: "inherit" }}
    >
      {/* Brand header */}
      <div className="mb-8 text-center">
        {form.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.logoUrl}
            alt={form.orgName}
            className="mx-auto mb-3 h-10 max-w-[160px] object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <p className="text-2xl font-bold tracking-tight text-white">
            {form.orgName || "Your Org"}
          </p>
        )}
        <p className="mt-1 text-sm text-gray-400">{form.tagline || "Candidate Assessment"}</p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-[280px] rounded-xl border border-gray-700 bg-gray-800 p-6 space-y-4">
        {/* Fields mock */}
        {["Roll Number", "Email", "Password"].map((label) => (
          <div key={label}>
            <p className="mb-1 text-xs text-gray-300">{label}</p>
            <div className="h-8 rounded-md border border-gray-700 bg-gray-900" />
          </div>
        ))}

        {/* Button */}
        <button
          type="button"
          className="mt-1 w-full rounded-md py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: col }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Waiting-room preview ───────────────────────────────────────────────────

function WaitingPreview({ form }: { form: BrandingForm }) {
  const col = form.primaryColour || "#3730A3";

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-5 bg-gray-900 px-8 text-center">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {form.orgName || "Your Org"} Assess
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Welcome, Candidate</h2>
        <p className="mt-0.5 text-sm text-gray-400">Hang tight — the session begins shortly.</p>
      </div>
      <p className="text-5xl font-bold" style={{ color: col }}>60s</p>
      <p className="text-xs text-gray-500">12 candidates have joined</p>
    </div>
  );
}

// ─── Colour picker ──────────────────────────────────────────────────────────

function ColourPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-2">
        {PRESET_COLOURS.map((p) => (
          <button
            key={p.value}
            type="button"
            title={p.label}
            onClick={() => onChange(p.value)}
            className="relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: p.value,
              borderColor: value === p.value ? "#1A1B23" : "transparent",
              boxShadow: value === p.value ? "0 0 0 2px white, 0 0 0 4px " + p.value : undefined,
            }}
          />
        ))}
      </div>

      {/* Custom colour input */}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded-lg border border-[#E8E6DF] bg-white p-0.5"
          title="Custom colour"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3730A3"
          className="w-32 rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 font-mono text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
        />
        <span className="text-sm text-[#6B6A63]">Custom hex</span>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

type PreviewTab = "login" | "waiting";

export default function BrandingPage() {
  const [form, setForm] = useState<BrandingForm>(DEFAULTS);
  const [saved, setSaved] = useState<BrandingForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("login");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/branding");
      const data = await res.json();
      const b = {
        orgName: data.branding?.orgName ?? DEFAULTS.orgName,
        tagline: data.branding?.tagline ?? DEFAULTS.tagline,
        logoUrl: data.branding?.logoUrl ?? "",
        primaryColour: data.branding?.primaryColour ?? DEFAULTS.primaryColour,
      };
      setForm(b);
      setSaved(b);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function setField<K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isDirty =
    form.orgName !== saved.orgName ||
    form.tagline !== saved.tagline ||
    form.logoUrl !== saved.logoUrl ||
    form.primaryColour !== saved.primaryColour;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setSaved({ ...form });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch {
      alert("Failed to save branding. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setForm({ ...saved });
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="border-b border-[#E8E6DF] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <Link href="/admin" className="text-sm text-[#6B6A63] hover:text-[#1A1B23]">
            ← Admin dashboard
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1A1B23]">
                Branding Editor
              </h1>
              <p className="mt-0.5 text-sm text-[#6B6A63]">
                Customise how your assessment portal looks to candidates.
              </p>
            </div>
            {isDirty && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  form="branding-form"
                  disabled={saving}
                  className="rounded-lg bg-[#3730A3] px-5 py-2 text-sm font-medium text-white hover:bg-[#2D2785] disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
            {savedMsg && !isDirty && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Saved
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#3730A3] border-t-transparent" />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_420px]">

            {/* ── Left: form ── */}
            <form id="branding-form" onSubmit={handleSave} className="space-y-8">

              {/* Identity */}
              <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
                <h2 className="mb-5 text-base font-semibold text-[#1A1B23]">Identity</h2>
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">
                      Organisation name <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={form.orgName}
                      onChange={(e) => setField("orgName", e.target.value)}
                      placeholder="Your organisation name"
                      className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                    />
                    <p className="mt-1 text-xs text-[#6B6A63]">Shown on the candidate login and waiting-room pages.</p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Tagline</label>
                    <input
                      value={form.tagline}
                      onChange={(e) => setField("tagline", e.target.value)}
                      placeholder="e.g. Candidate Assessment"
                      className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                    />
                  </div>
                </div>
              </section>

              {/* Logo */}
              <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
                <h2 className="mb-1 text-base font-semibold text-[#1A1B23]">Logo</h2>
                <p className="mb-5 text-sm text-[#6B6A63]">
                  Paste a public image URL. Displays above the login form.
                  If blank, the organisation name is shown as text.
                </p>

                <div className="space-y-4">
                  <input
                    type="url"
                    value={form.logoUrl}
                    onChange={(e) => setField("logoUrl", e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                  />

                  {form.logoUrl && (
                    <div className="flex items-center gap-4 rounded-xl border border-[#E8E6DF] bg-[#FAFAF8] px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.logoUrl}
                        alt="Logo preview"
                        className="h-10 max-w-[160px] object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <p className="text-xs text-[#6B6A63]">Logo preview</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Colour */}
              <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
                <h2 className="mb-1 text-base font-semibold text-[#1A1B23]">Primary colour</h2>
                <p className="mb-5 text-sm text-[#6B6A63]">
                  Applied to buttons and accent elements on candidate-facing pages.
                </p>
                <ColourPicker
                  value={form.primaryColour}
                  onChange={(v) => setField("primaryColour", v)}
                />

                {/* Colour preview chips */}
                <div className="mt-5 flex flex-wrap gap-2">
                  <span
                    className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
                    style={{ backgroundColor: form.primaryColour }}
                  >
                    Button
                  </span>
                  <span
                    className="rounded-full border px-4 py-1.5 text-sm font-medium"
                    style={{ borderColor: form.primaryColour, color: form.primaryColour }}
                  >
                    Outlined
                  </span>
                  <span
                    className="rounded-full px-4 py-1.5 text-sm font-medium"
                    style={{ backgroundColor: form.primaryColour + "18", color: form.primaryColour }}
                  >
                    Subtle
                  </span>
                </div>
              </section>

              {/* Save (bottom) */}
              <div className="flex justify-end gap-3 border-t border-[#E8E6DF] pt-4">
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
                  >
                    Discard changes
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || !isDirty}
                  className="rounded-lg bg-[#3730A3] px-6 py-2 text-sm font-medium text-white hover:bg-[#2D2785] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save branding"}
                </button>
              </div>
            </form>

            {/* ── Right: live preview ── */}
            <div className="lg:sticky lg:top-8 lg:self-start">
              <div className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
                {/* Preview tabs */}
                <div className="flex border-b border-[#E8E6DF]">
                  {(["login", "waiting"] as PreviewTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPreviewTab(tab)}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                        previewTab === tab
                          ? "border-b-2 border-[#3730A3] text-[#3730A3]"
                          : "text-[#6B6A63] hover:text-[#1A1B23]"
                      }`}
                    >
                      {tab === "login" ? "Login page" : "Waiting room"}
                    </button>
                  ))}
                </div>

                {/* Preview frame — scaled down from 480px to fit the panel */}
                <div className="relative overflow-hidden bg-gray-900" style={{ height: 340 }}>
                  <div
                    style={{
                      width: 480,
                      transformOrigin: "top left",
                      transform: "scale(0.875)",
                    }}
                  >
                    {previewTab === "login" ? (
                      <LoginPreview form={form} />
                    ) : (
                      <WaitingPreview form={form} />
                    )}
                  </div>
                </div>

                <div className="border-t border-[#E8E6DF] px-4 py-3">
                  <p className="text-center text-xs text-[#6B6A63]">
                    Live preview — updates as you type
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
