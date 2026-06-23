"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { SETTINGS_DEFAULTS, type AssessmentSettings } from "@/lib/get-settings";

// ─── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
        checked ? "bg-[#3730A3]" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  desc,
  checked,
  onChange,
  warning,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  warning?: string;
}) {
  return (
    <div className="py-4 border-b border-[#E8E6DF] last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1B23]">{label}</p>
          <p className="mt-0.5 text-xs text-[#6B6A63]">{desc}</p>
          {!checked && warning && (
            <p className="mt-1 text-xs font-medium text-amber-600">{warning}</p>
          )}
        </div>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm] = useState<AssessmentSettings>(SETTINGS_DEFAULTS);
  const [saved, setSaved] = useState<AssessmentSettings>(SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      const s: AssessmentSettings = { ...SETTINGS_DEFAULTS, ...data.settings };
      setForm(s);
      setSaved(s);
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof AssessmentSettings>(key: K, value: AssessmentSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { alert("Failed to save settings."); return; }
      setSaved({ ...form });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const antiCheatAllOff =
    !form.antiCheatTabSwitch &&
    !form.antiCheatContextMenu &&
    !form.antiCheatCopyPaste &&
    !form.antiCheatScreenshot &&
    !form.antiCheatDevTools;

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="border-b border-[#E8E6DF] bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link href="/admin" className="text-sm text-[#6B6A63] hover:text-[#1A1B23]">← Admin dashboard</Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1A1B23]">Settings</h1>
              <p className="mt-0.5 text-sm text-[#6B6A63]">Configure anti-cheat, exam behaviour, and access rules.</p>
            </div>
            <div className="flex items-center gap-3">
              {savedMsg && !isDirty && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Saved
                </span>
              )}
              {isDirty && (
                <>
                  <button
                    type="button"
                    onClick={load}
                    className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    form="settings-form"
                    disabled={saving}
                    className="rounded-lg bg-[#3730A3] px-5 py-2 text-sm font-medium text-white hover:bg-[#2D2785] disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#3730A3] border-t-transparent" />
        </div>
      ) : (
        <form id="settings-form" onSubmit={handleSave}>
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">

            {/* Anti-cheat warning */}
            {antiCheatAllOff && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-amber-700">All anti-cheat rules are disabled. Candidates can browse freely during the exam.</p>
              </div>
            )}

            {/* Anti-cheat section */}
            <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#1A1B23]">Anti-cheat rules</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  antiCheatAllOff
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}>
                  {antiCheatAllOff ? "All off" : "Active"}
                </span>
              </div>
              <p className="mb-4 text-sm text-[#6B6A63]">Changes take effect immediately — no restart required.</p>

              <SettingRow
                label="Tab switch detection"
                desc="1st switch shows a warning; 2nd disqualifies the candidate."
                checked={form.antiCheatTabSwitch}
                onChange={(v) => set("antiCheatTabSwitch", v)}
                warning="Tab-switching will not be detected or penalised."
              />
              <SettingRow
                label="Right-click block"
                desc="Prevents the browser context menu during the exam."
                checked={form.antiCheatContextMenu}
                onChange={(v) => set("antiCheatContextMenu", v)}
              />
              <SettingRow
                label="Copy / paste block"
                desc="Disables text selection, copy, and cut events."
                checked={form.antiCheatCopyPaste}
                onChange={(v) => set("antiCheatCopyPaste", v)}
                warning="Candidates can copy question text freely."
              />
              <SettingRow
                label="Screenshot key interception"
                desc="Shows an overlay when PrintScreen or macOS screenshot shortcuts are pressed."
                checked={form.antiCheatScreenshot}
                onChange={(v) => set("antiCheatScreenshot", v)}
              />
              <SettingRow
                label="Developer tools block"
                desc="Intercepts F12, Ctrl+Shift+I/J/C, and other DevTools shortcuts."
                checked={form.antiCheatDevTools}
                onChange={(v) => set("antiCheatDevTools", v)}
              />
            </section>

            {/* Exam behaviour */}
            <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-[#1A1B23]">Exam behaviour</h2>

              <SettingRow
                label="Speed bonus"
                desc="Candidates earn extra points for answering quickly. Disabling zeroes out speed bonus on all questions globally."
                checked={form.speedBonusEnabled}
                onChange={(v) => set("speedBonusEnabled", v)}
                warning="Speed bonus is disabled globally — per-question speedBonusMax is ignored."
              />

              {/* Grace period */}
              <div className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#1A1B23]">Grace period after timer</p>
                    <p className="mt-0.5 text-xs text-[#6B6A63]">
                      Extra seconds a candidate gets after the visible timer hits 0 before the answer is auto-submitted.
                      Useful to account for network latency. 0 = no grace period.
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={form.gracePeriodSec}
                      onChange={(e) => set("gracePeriodSec", Math.max(0, Math.min(30, Number(e.target.value))))}
                      className="w-16 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-center text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                    />
                    <span className="text-sm text-[#6B6A63]">sec</span>
                  </div>
                </div>
                {form.gracePeriodSec > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-gray-100" style={{ height: 6 }}>
                      <div
                        className="h-full rounded-full bg-[#3730A3] transition-all"
                        style={{ width: `${(form.gracePeriodSec / 30) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#6B6A63]">{form.gracePeriodSec}s / 30s max</span>
                  </div>
                )}
              </div>
            </section>

            {/* Geo-restriction */}
            <section className="rounded-2xl border border-[#E8E6DF] bg-white p-6">
              <h2 className="mb-1 text-base font-semibold text-[#1A1B23]">Geo-restriction</h2>
              <p className="mb-4 text-sm text-[#6B6A63]">
                Restrict exam access by country. Candidates whose registered country is not in this list
                will be blocked when the exam starts. Leave blank to allow all countries.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      form.geoRestriction.trim() ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span className="text-sm text-[#6B6A63]">
                    {form.geoRestriction.trim()
                      ? `Active — allowed: ${form.geoRestriction.split(",").map(c => c.trim().toUpperCase()).filter(Boolean).join(", ")}`
                      : "Off — all countries allowed"}
                  </span>
                </div>

                <input
                  type="text"
                  value={form.geoRestriction}
                  onChange={(e) => set("geoRestriction", e.target.value)}
                  placeholder="e.g. CA, US, GB"
                  className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 font-mono text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                />
                <p className="text-xs text-[#6B6A63]">
                  Comma-separated ISO 3166-1 alpha-2 codes. Candidates with no country recorded are always blocked when restriction is active.
                </p>
              </div>
            </section>

            {/* Save (bottom) */}
            <div className="flex justify-end gap-3 border-t border-[#E8E6DF] pt-4">
              {isDirty && (
                <button
                  type="button"
                  onClick={load}
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
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>

          </div>
        </form>
      )}
    </main>
  );
}
