"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const REASON_LABELS: Record<string, string> = {
  TAB_SWITCH_2:  "You switched away from the exam tab more than once.",
  PAGE_REFRESH:  "The exam page was refreshed or closed mid-session.",
  geo_restricted: "This assessment is not available in your region.",
};

function subscribeNoop() {
  return () => {};
}
function getReason() {
  return sessionStorage.getItem("disqualifyReason");
}
function getReasonServer() {
  return null;
}

export default function DisqualifiedPage() {
  const reason = useSyncExternalStore(subscribeNoop, getReason, getReasonServer);

  const message = reason
    ? REASON_LABELS[reason] ?? reason
    : "Your session was ended by the proctor.";

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 border border-red-100">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <span className="inline-block rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
          Disqualified
        </span>

        <h1 className="mt-3 text-xl font-semibold text-[#0F172A]">
          Your assessment has ended
        </h1>
        <p className="mt-2 text-sm text-[#64748B] max-w-xs mx-auto">
          {message}
        </p>

        {reason && (
          <p className="mt-3 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-mono text-[#94A3B8]">
            {reason}
          </p>
        )}

        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left">
          <p className="text-xs font-semibold text-[#0F172A] mb-2">What happened?</p>
          <p className="text-xs text-[#64748B]">
            Our proctoring system detected activity that violated the assessment rules.
            If you believe this is an error, please contact your assessment organiser.
          </p>
        </div>

        <Link
          href="/candidate/login"
          className="mt-4 inline-block text-xs text-[#64748B] hover:text-[#2E0BFC] underline-offset-2 hover:underline"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
