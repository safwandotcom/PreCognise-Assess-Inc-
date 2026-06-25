"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  name: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  gracePeriodMin: number;
  token: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function JoinGate({ name, status, scheduledAt, startedAt, gracePeriodMin, token }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loginUrl = `/candidate/login?token=${token}`;

  // ── ENDED ──────────────────────────────────────────────────────────────────
  if (status === "ENDED") {
    return (
      <Shell name={name}>
        <StatusIcon type="closed" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment closed</h2>
        <p className="mt-1 text-sm text-[#64748B]">This assessment has ended and is no longer accepting entries.</p>
      </Shell>
    );
  }

  // ── DRAFT ──────────────────────────────────────────────────────────────────
  if (status === "DRAFT") {
    return (
      <Shell name={name}>
        <StatusIcon type="draft" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Not yet available</h2>
        <p className="mt-1 text-sm text-[#64748B]">This assessment is not yet available. Check back later.</p>
      </Shell>
    );
  }

  // ── SCHEDULED — countdown to start ────────────────────────────────────────
  if (status === "SCHEDULED") {
    const opensAt = scheduledAt ? new Date(scheduledAt).getTime() : null;
    const msLeft = opensAt ? opensAt - now : null;

    if (msLeft !== null && msLeft <= 0) {
      // Scheduled time has passed but campaign hasn't started yet — refresh every 5s
      return (
        <Shell name={name}>
          <StatusIcon type="scheduled" />
          <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment starting soon…</h2>
          <p className="mt-1 text-sm text-[#64748B]">Please wait. The assessment is about to begin.</p>
          <AutoRefresh intervalMs={5000} />
        </Shell>
      );
    }

    return (
      <Shell name={name}>
        <StatusIcon type="scheduled" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment opens in</h2>
        {msLeft !== null ? (
          <div className="mt-4 flex items-center justify-center">
            <span className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-8 py-4 font-mono text-3xl font-bold tracking-widest text-[#6366F1]">
              {formatCountdown(msLeft)}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#64748B]">Starting at a scheduled time.</p>
        )}
        {scheduledAt && (
          <p className="mt-3 text-xs text-[#94A3B8]">
            Scheduled for {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
        <p className="mt-4 text-xs text-[#94A3B8]">Keep this page open — you&apos;ll be able to join when it starts.</p>
        <AutoRefresh intervalMs={5000} />
      </Shell>
    );
  }

  // ── LIVE or PAUSED — grace period check ───────────────────────────────────
  if (status === "LIVE" || status === "PAUSED") {
    const gracePeriodMs = gracePeriodMin * 60 * 1000;
    const startedMs = startedAt ? new Date(startedAt).getTime() : null;
    const elapsed = startedMs ? now - startedMs : 0;
    const withinGrace = gracePeriodMin === 0 || elapsed <= gracePeriodMs;
    const graceMsLeft = startedMs ? Math.max(0, startedMs + gracePeriodMs - now) : 0;

    if (!withinGrace) {
      return (
        <Shell name={name}>
          <StatusIcon type="late" />
          <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Entry period has closed</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            The assessment is underway but the entry window ({gracePeriodMin} min) has passed. You can no longer join.
          </p>
        </Shell>
      );
    }

    return (
      <Shell name={name}>
        <StatusIcon type="live" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment is underway</h2>
        <p className="mt-2 text-sm text-[#64748B]">
          {status === "PAUSED"
            ? "The assessment is currently paused. You can still log in."
            : "The assessment has started. Join now before the entry window closes."}
        </p>

        {gracePeriodMin > 0 && graceMsLeft > 0 && status === "LIVE" && (
          <div className="mt-4 text-center">
            <p className="text-xs text-[#94A3B8] mb-1">Entry closes in</p>
            <span className="inline-block rounded-xl border border-amber-200 bg-amber-50 px-5 py-2 font-mono text-lg font-bold text-amber-700">
              {formatCountdown(graceMsLeft)}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push(loginUrl)}
          className="mt-6 w-full rounded-xl bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#4F46E5] transition-colors"
        >
          Join Now →
        </button>
      </Shell>
    );
  }

  return null;
}

// ── Shared layout shell ───────────────────────────────────────────────────────

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">Assessment</p>
        <h1 className="mt-1 text-lg font-bold text-[#0F172A]">{name}</h1>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ type }: { type: "draft" | "scheduled" | "live" | "late" | "closed" }) {
  const configs = {
    draft:     { bg: "bg-[#F1F5F9]",  ring: "ring-[#E2E8F0]",   text: "text-[#94A3B8]" },
    scheduled: { bg: "bg-blue-50",    ring: "ring-blue-100",     text: "text-blue-500" },
    live:      { bg: "bg-green-50",   ring: "ring-green-100",    text: "text-green-600" },
    late:      { bg: "bg-amber-50",   ring: "ring-amber-100",    text: "text-amber-600" },
    closed:    { bg: "bg-red-50",     ring: "ring-red-100",      text: "text-red-500" },
  };
  const c = configs[type];
  const icons = {
    draft:     <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />,
    scheduled: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    live:      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />,
    late:      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
    closed:    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />,
  };

  return (
    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-1 ${c.bg} ${c.ring}`}>
      <svg className={`h-6 w-6 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {icons[type]}
      </svg>
    </div>
  );
}

// ── Silent auto-refresh ───────────────────────────────────────────────────────

function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), intervalMs);
    return () => clearTimeout(id);
  }, [intervalMs]);
  return null;
}
