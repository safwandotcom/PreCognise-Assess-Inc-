"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-store";
import { useBranding } from "@/lib/use-branding";

interface AntiCheat {
  camera: boolean;
  fullscreen: boolean;
  multiDisplay: boolean;
}

interface DeviceCheckData {
  alreadyConsented: boolean;
  antiCheat: AntiCheat;
}

type StepStatus = "pending" | "checking" | "granted" | "denied" | "unsupported";

// iOS Safari on iPhone (and most in-app browser webviews) don't implement
// the Fullscreen API for regular pages at all — a platform limitation, not
// something a JS workaround can fix. Feature-detect before ever attempting
// requestFullscreen() rather than trapping the candidate behind a "return
// to fullscreen" prompt that can never succeed on that device.
function isFullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

export default function DeviceCheckPage() {
  const router = useRouter();
  const branding = useBranding();
  const [data, setData] = useState<DeviceCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cameraStatus, setCameraStatus] = useState<StepStatus>("pending");
  const [fullscreenStatus, setFullscreenStatus] = useState<StepStatus>("pending");
  const [displayStatus, setDisplayStatus] = useState<StepStatus>("pending");
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const displayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/candidate/login"); return; }

    fetch("/api/candidate/device-check", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: DeviceCheckData) => {
        if (d.alreadyConsented) {
          router.replace("/candidate/waiting-room");
          return;
        }
        const { camera, fullscreen, multiDisplay } = d.antiCheat;
        if (!camera && !fullscreen && !multiDisplay) {
          // Nothing to consent to for this campaign — skip the gate entirely.
          router.replace("/candidate/waiting-room");
          return;
        }
        setData(d);
      })
      .catch(() => setError("Failed to load device check. Please refresh."))
      .finally(() => setLoading(false));
  }, [router]);

  // If this device can't do real fullscreen at all, skip the requirement
  // entirely rather than offering a button that can never succeed — and
  // record it so the admin can see this candidate's session ran without
  // fullscreen enforcement, in the live view and results.
  useEffect(() => {
    const checkFullscreenSupport = () => {
      if (!data?.antiCheat.fullscreen) return;
      if (isFullscreenSupported()) return;
      setFullscreenStatus("unsupported");
      fetch("/api/candidate/fullscreen-unsupported", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      }).catch(() => {
        // Non-fatal — the exam page detects and records this independently
        // too, as a safety net.
      });
    };
    checkFullscreenSupport();
  }, [data?.antiCheat.fullscreen]);

  // Single-display is a passive check (screen.isExtended needs no
  // permission) — poll it while it's still showing extended, so a candidate
  // who unplugs the extra monitor sees it clear on its own, matching the
  // same poll-based pattern the exam page uses for the same check.
  useEffect(() => {
    if (!data?.antiCheat.multiDisplay) return;

    const check = () => {
      if (typeof window.screen.isExtended !== "boolean") {
        // Browser doesn't support the check — don't block on something we
        // can't verify; the exam page's own ongoing check still applies.
        setDisplayStatus("granted");
        return;
      }
      setDisplayStatus(window.screen.isExtended ? "denied" : "granted");
    };
    check();
    displayIntervalRef.current = setInterval(check, 2000);
    return () => {
      if (displayIntervalRef.current !== null) clearInterval(displayIntervalRef.current);
    };
  }, [data?.antiCheat.multiDisplay]);

  const requestCameraAccess = useCallback(async () => {
    setCameraStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Just confirming access — the exam page starts its own stream when
      // the exam actually begins. Permission is granted per-origin, so that
      // later call succeeds silently with no new prompt.
      stream.getTracks().forEach((t) => t.stop());
      setCameraStatus("granted");
    } catch {
      setCameraStatus("denied");
    }
  }, []);

  const requestFullscreenAccess = useCallback(async () => {
    setFullscreenStatus("checking");
    try {
      // A genuine click handler — real transient activation, so this
      // reliably succeeds (unlike requesting it from an unattended effect,
      // see the exam page's fullscreen handling for why that matters).
      await document.documentElement.requestFullscreen();
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setFullscreenStatus("granted");
    } catch {
      setFullscreenStatus("denied");
    }
  }, []);

  const allStepsReady =
    data !== null &&
    (!data.antiCheat.camera || cameraStatus === "granted") &&
    (!data.antiCheat.fullscreen || fullscreenStatus === "granted" || fullscreenStatus === "unsupported") &&
    (!data.antiCheat.multiDisplay || displayStatus === "granted");

  const handleContinue = useCallback(async () => {
    if (!allStepsReady || !checked || confirming) return;
    setConfirming(true);
    try {
      await fetch("/api/candidate/device-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      router.replace("/candidate/waiting-room");
    } catch {
      setError("Something went wrong. Please try again.");
      setConfirming(false);
    }
  }, [allStepsReady, checked, confirming, router]);

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

  const { antiCheat: ac } = data;
  const monitoringMethods: string[] = [];
  if (ac.camera) monitoringMethods.push("camera and microphone");
  if (ac.fullscreen) monitoringMethods.push("fullscreen mode");
  if (ac.multiDisplay) monitoringMethods.push("single-display detection");
  const methodsList =
    monitoringMethods.length <= 1
      ? monitoringMethods[0]
      : `${monitoringMethods.slice(0, -1).join(", ")} and ${monitoringMethods[monitoringMethods.length - 1]}`;

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
            Device check
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Confirm the following before you&apos;re placed in the waiting room.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-4 space-y-3">
          {ac.camera && (
            <DeviceCheckStep
              title="Camera & microphone"
              description="This assessment requires camera and microphone access for the entire exam."
              status={cameraStatus}
              accent={branding.primaryColour}
              onAction={requestCameraAccess}
              actionLabel={cameraStatus === "denied" ? "Try again" : "Grant access"}
            />
          )}
          {ac.fullscreen && (
            <DeviceCheckStep
              title="Fullscreen mode"
              description={
                fullscreenStatus === "unsupported"
                  ? "Your browser doesn't support fullscreen mode — continuing without it. This is noted on your session."
                  : "This assessment requires fullscreen mode for the entire exam."
              }
              status={fullscreenStatus}
              accent={branding.primaryColour}
              onAction={fullscreenStatus === "unsupported" ? undefined : requestFullscreenAccess}
              actionLabel={fullscreenStatus === "denied" ? "Try again" : "Enter fullscreen"}
            />
          )}
          {ac.multiDisplay && (
            <DeviceCheckStep
              title="Single display"
              description="This assessment requires a single display — disconnect any extra monitors."
              status={displayStatus}
              accent={branding.primaryColour}
            />
          )}
        </div>

        {/* Consent checkbox */}
        <div className="mb-5 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-[#6366F1]"
            />
            <span className="text-sm text-[#334155] leading-relaxed">
              I agree to be monitored via {methodsList} for the duration of this assessment.
            </span>
          </label>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          onClick={handleContinue}
          disabled={!allStepsReady || !checked || confirming}
          className="w-full rounded-xl py-3.5 text-base font-semibold text-white shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
          style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
        >
          {confirming ? "Continuing…" : "Continue"}
        </button>

        <p className="mt-3 text-center text-xs text-[#94A3B8]">
          Your consent is recorded with a timestamp.
        </p>
      </div>
    </div>
  );
}

function DeviceCheckStep({
  title,
  description,
  status,
  accent,
  onAction,
  actionLabel,
}: {
  title: string;
  description: string;
  status: StepStatus;
  accent: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <StatusIcon status={status} accent={accent} />
        <div>
          <p className="text-sm font-medium text-[#0F172A]">{title}</p>
          <p className="mt-0.5 text-xs text-[#64748B]">{description}</p>
        </div>
      </div>
      {onAction && status !== "granted" && (
        <button
          onClick={onAction}
          disabled={status === "checking"}
          className="shrink-0 rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#334155] transition hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : actionLabel}
        </button>
      )}
    </div>
  );
}

function StatusIcon({ status, accent }: { status: StepStatus; accent: string }) {
  if (status === "granted") {
    return (
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: accent }}>
        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
        <svg className="h-3 w-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (status === "unsupported") {
    return (
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-[#E2E8F0]" />;
}
