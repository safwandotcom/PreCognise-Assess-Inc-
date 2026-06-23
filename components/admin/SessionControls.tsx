// components/admin/SessionControls.tsx
"use client";

import { useState } from "react";
import { getAdminSocket } from "@/lib/admin-socket-client";
import type { AdminCandidate } from "./CandidateGrid";

interface SessionControlsProps {
  candidates: AdminCandidate[];
}

const DISQUALIFY_REASONS = [
  { value: "MANUAL_REVIEW",  label: "Manual review" },
  { value: "SUSPECTED_PROXY", label: "Suspected proxy / impersonation" },
  { value: "EXTERNAL_HELP",  label: "External assistance suspected" },
  { value: "OTHER",          label: "Other" },
];

export default function SessionControls({ candidates }: SessionControlsProps) {
  const [busy, setBusy] = useState<"start" | "pause" | "end" | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedReason, setSelectedReason] = useState(DISQUALIFY_REASONS[0].value);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function runAction(action: "start" | "pause" | "end") {
    setBusy(action);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Request failed");

      if (action === "start") {
        getAdminSocket().emit("session:start");
      } else if (action === "end") {
        getAdminSocket().emit("session:end");
      }

      setStatusMsg(`Session ${action === "start" ? "started" : action === "pause" ? "paused" : "ended"}.`);
    } catch (err) {
      console.error(err);
      setStatusMsg("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function manualDisqualify() {
    if (!selectedCandidateId) {
      setStatusMsg("Pick a candidate first.");
      return;
    }
    getAdminSocket().emit("admin:disqualify", {
      candidateId: selectedCandidateId,
      reason: selectedReason,
    });
    setStatusMsg("Disqualify sent.");
    setSelectedCandidateId("");
  }

  const selectCls = "rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]";

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <h3 className="mb-1 text-sm font-semibold text-[#0F172A]">Session Controls</h3>
      <p className="mb-4 text-xs text-[#64748B]">Start, pause, or end the live assessment session.</p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => runAction("start")}
          disabled={busy !== null}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
        >
          {busy === "start" ? "Starting..." : "Start"}
        </button>
        <button
          onClick={() => runAction("pause")}
          disabled={busy !== null}
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition"
        >
          {busy === "pause" ? "Pausing..." : "Pause"}
        </button>
        <button
          onClick={() => runAction("end")}
          disabled={busy !== null}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
        >
          {busy === "end" ? "Ending..." : "End"}
        </button>
      </div>

      <div className="mt-5 border-t border-[#E2E8F0] pt-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          Manual Disqualify
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
            className={selectCls}
          >
            <option value="">Select candidate...</option>
            {candidates
              .filter((c) => c.status !== "DISQUALIFIED")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (#{c.rollNumber})
                </option>
              ))}
          </select>
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            className={selectCls}
          >
            {DISQUALIFY_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={manualDisqualify}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition"
          >
            Disqualify
          </button>
        </div>
      </div>

      {statusMsg && (
        <p className="mt-4 text-xs text-[#64748B]">{statusMsg}</p>
      )}
    </div>
  );
}
