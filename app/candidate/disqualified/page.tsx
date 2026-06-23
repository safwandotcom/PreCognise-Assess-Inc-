"use client";

import { useSyncExternalStore } from "react";

const REASON_LABELS: Record<string, string> = {
  TAB_SWITCH_2: "You switched away from the exam tab more than once.",
  PAGE_REFRESH: "The exam page was refreshed or closed mid-session.",
  geo_restricted: "This assessment is not available in your region.",
};

function subscribeNoop() {
  return () => {};
}
function getReason() {
  return sessionStorage.getItem("disqualifyReason");
}
function getReasonServer() {
  return null; // sessionStorage doesn't exist during SSR
}

export default function DisqualifiedPage() {
  const reason = useSyncExternalStore(subscribeNoop, getReason, getReasonServer);

  const message = reason
    ? REASON_LABELS[reason] ?? reason
    : "Your session was ended by the proctor.";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-900 px-4 text-center">
      <p className="text-sm uppercase tracking-wide text-red-500">Disqualified</p>
      <h1 className="text-2xl font-semibold text-white">Your assessment has ended</h1>
      <p className="max-w-sm text-gray-400">{message}</p>
      {reason && (
        <p className="mt-2 rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-500">{reason}</p>
      )}
    </main>
  );
}