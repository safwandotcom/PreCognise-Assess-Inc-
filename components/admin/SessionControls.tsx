// components/admin/SessionControls.tsx
"use client";

import { useState } from "react";
import { getAdminSocket } from "@/lib/admin-socket-client";
import type { AdminCandidate } from "./CandidateGrid";

interface SessionControlsProps {
  candidates: AdminCandidate[];
}

const DISQUALIFY_REASONS = [
  { value: "MANUAL_REVIEW", label: "Manual review" },
  { value: "SUSPECTED_PROXY", label: "Suspected proxy / impersonation" },
  { value: "EXTERNAL_HELP", label: "External assistance suspected" },
  { value: "OTHER", label: "Other" },
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

      // DB update succeeded — now tell candidates directly via socket.
      // Pause is admin-side only for this demo: it does not interrupt
      // an in-progress exam (no timer freeze / resume handling yet).
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

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-300">
        Session Controls
      </h3>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => runAction("start")}
          disabled={busy !== null}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          {busy === "start" ? "Starting..." : "Start"}
        </button>
        <button
          onClick={() => runAction("pause")}
          disabled={busy !== null}
          className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-50"
        >
          {busy === "pause" ? "Pausing..." : "Pause"}
        </button>
        <button
          onClick={() => runAction("end")}
          disabled={busy !== null}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy === "end" ? "Ending..." : "End"}
        </button>
      </div>

      <div className="mt-4 border-t border-gray-700 pt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Manual Disqualify
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
            className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200"
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
            className="rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200"
          >
            {DISQUALIFY_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={manualDisqualify}
            className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Disqualify
          </button>
        </div>
      </div>

      {statusMsg && (
        <p className="mt-3 text-xs text-gray-400">{statusMsg}</p>
      )}
    </div>
  );
}