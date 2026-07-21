"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-store";
import { useBranding } from "@/lib/use-branding";

interface AntiCheat {
  tabSwitch: boolean;
  tabSwitchLimit: number;
  fullscreen: boolean;
  copyPaste: boolean;
  rightClick: boolean;
  screenshot: boolean;
  devTools: boolean;
  duplicateLogin: boolean;
}

interface CampaignInfo {
  name: string;
  durationSec: number;
  questionCount: number;
  instructionsHtml: string | null;
  antiCheat: AntiCheat;
}

interface InstructionsData {
  alreadyAcknowledged: boolean;
  candidateName: string;
  campaign: CampaignInfo;
}

export default function InstructionsPage() {
  const router = useRouter();
  const branding = useBranding();
  const [data, setData] = useState<InstructionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/candidate/login"); return; }

    fetch("/api/candidate/instructions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: InstructionsData) => {
        if (d.alreadyAcknowledged) {
          router.replace("/candidate/exam");
          return;
        }
        setData(d);
      })
      .catch(() => setError("Failed to load instructions. Please refresh."))
      .finally(() => setLoading(false));
  }, [router]);

  const handleStart = useCallback(async () => {
    if (!checked || confirming) return;
    setConfirming(true);
    const token = getToken();
    try {
      await fetch("/api/candidate/acknowledge", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      router.replace("/candidate/exam");
    } catch {
      setError("Something went wrong. Please try again.");
      setConfirming(false);
    }
  }, [checked, confirming, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[#6366F1]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <p className="text-red-500 text-sm">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  const { campaign } = data;
  const ac = campaign.antiCheat;
  const durationMin = Math.round(campaign.durationSec / 60);

  // Build plain-language anti-cheat rules from campaign settings
  const rules: string[] = [];
  if (ac.tabSwitch) {
    rules.push(
      ac.tabSwitchLimit <= 1
        ? "Do not switch tabs or windows — you will be disqualified immediately."
        : `Switching tabs or windows more than ${ac.tabSwitchLimit - 1} time${ac.tabSwitchLimit - 1 > 1 ? "s" : ""} will disqualify you.`
    );
  }
  if (ac.fullscreen) rules.push("You must stay in fullscreen mode for the entire exam.");
  if (ac.copyPaste) rules.push("Copying and pasting text is disabled.");
  if (ac.rightClick) rules.push("Right-clicking is disabled during the exam.");
  if (ac.screenshot) rules.push("Screenshot attempts are blocked and recorded.");
  if (ac.devTools) rules.push("Browser developer tools are blocked during the exam.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
  rules.push("Refreshing or closing the browser tab will disqualify you immediately.");
  rules.push("Each question has a timer — unanswered questions are skipped automatically.");

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">

        {/* Org badge */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl mb-3"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
          >
            <span className="text-xl font-bold text-white">
              {branding.orgName.charAt(0)}
            </span>
          </div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#64748B]">
            {branding.orgName}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-[#0F172A]">
            Before you begin
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Read carefully before starting <strong>{campaign.name}</strong>.
          </p>
        </div>

        {/* Stats row */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#0F172A]">{campaign.questionCount}</p>
            <p className="mt-0.5 text-xs text-[#64748B]">
              Question{campaign.questionCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#0F172A]">
              {campaign.durationSec > 0 ? `${durationMin}` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-[#64748B]">
              {campaign.durationSec > 0 ? "Minutes total" : "No time limit"}
            </p>
          </div>
        </div>

        {/* Custom instructions from admin — only shown if set */}
        {campaign.instructionsHtml && (
          <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Instructions
            </h2>
            <div
              className="prose prose-sm max-w-none text-[#334155] text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: campaign.instructionsHtml }}
            />
          </div>
        )}

        {/* Anti-cheat rules */}
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-amber-800">
              Anti-cheat rules — violations will disqualify you
            </h2>
          </div>
          <ul className="space-y-2">
            {rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {rule}
              </li>
            ))}
          </ul>
        </div>

        {/* Acknowledgment checkbox */}
        <div className="mb-5 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-[#6366F1]"
            />
            <span className="text-sm text-[#334155] leading-relaxed">
              I have read and understood the instructions and anti-cheat rules. I agree to complete
              this assessment honestly and accept that violations may result in immediate disqualification.
            </span>
          </label>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!checked || confirming}
          className="w-full rounded-xl py-3.5 text-base font-semibold text-white shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
          style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
        >
          {confirming ? "Starting…" : "I understand — start the exam"}
        </button>

        <p className="mt-3 text-center text-xs text-[#94A3B8]">
          Your acknowledgment is recorded with a timestamp.
        </p>
      </div>
    </div>
  );
}