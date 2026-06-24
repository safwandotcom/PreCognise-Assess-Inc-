// app/admin/session/new/page.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = 1 | 2 | 3;

interface CreatedSession {
  id: string;
  joinToken: string;
  title: string;
}

interface ImportedCandidate {
  rollNumber: string;
  name: string;
  email: string;
  password: string;
}

function parseCSV(text: string): { name: string; rollNumber: string; email: string }[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const rollIdx = headers.indexOf("rollnumber");
  const emailIdx = headers.indexOf("email");
  if (nameIdx === -1 || rollIdx === -1 || emailIdx === -1) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return { name: cols[nameIdx] ?? "", rollNumber: cols[rollIdx] ?? "", email: cols[emailIdx] ?? "" };
  }).filter((r) => r.name && r.rollNumber && r.email);
}

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [session, setSession] = useState<CreatedSession | null>(null);

  // Step 1 state
  const [title, setTitle] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"manual" | "scheduled">("manual");
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [step1Busy, setStep1Busy] = useState(false);
  const [step1Error, setStep1Error] = useState("");

  // Step 2 state
  const [candidateTab, setCandidateTab] = useState<"csv" | "manual">("csv");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: ImportedCandidate[]; skipped: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualRoll, setManualRoll] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualAdded, setManualAdded] = useState<ImportedCandidate[]>([]);
  const [manualError, setManualError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setStep1Error("");
    if (!title.trim()) { setStep1Error("Title is required"); return; }
    setStep1Busy(true);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        scheduledAt: scheduleMode === "scheduled" && scheduledAt ? scheduledAt : null,
        autoStart: scheduleMode === "scheduled" ? autoStart : false,
      }),
    });
    const data = await res.json();
    setStep1Busy(false);
    if (!res.ok) { setStep1Error(data.error || "Failed to create session"); return; }
    setSession(data.session);
    setStep(2);
  }

  async function handleCSVImport() {
    if (!csvFile || !session) return;
    setImportError("");
    setCsvBusy(true);
    const text = await csvFile.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      setImportError("CSV must have columns: name, rollNumber, email (with header row)");
      setCsvBusy(false);
      return;
    }
    const res = await fetch(`/api/admin/session/${session.id}/candidates/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    setCsvBusy(false);
    if (!res.ok) {
      setImportError(data.error || "Import failed");
      return;
    }
    setImportResult(data);
  }

  function downloadCredentials(candidates: ImportedCandidate[]) {
    const header = "name,rollNumber,email,password\n";
    const rows = candidates.map((c) => `${c.name},${c.rollNumber},${c.email},${c.password}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-${session?.title ?? "session"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setManualError("");
    if (!manualName.trim() || !manualRoll.trim() || !manualEmail.trim()) {
      setManualError("All fields are required");
      return;
    }
    if (!session) return;
    setManualBusy(true);
    const res = await fetch(`/api/admin/session/${session.id}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: manualName.trim(), rollNumber: manualRoll.trim(), email: manualEmail.trim() }),
    });
    const data = await res.json();
    setManualBusy(false);
    if (!res.ok) { setManualError(data.error || "Failed to add candidate"); return; }
    setManualAdded((prev) => [...prev, { rollNumber: data.candidate.rollNumber, name: data.candidate.name, email: data.candidate.email, password: data.password }]);
    setManualName(""); setManualRoll(""); setManualEmail("");
  }

  const inputCls = "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]";

  return (
    <div className="px-7 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/session" className="text-sm text-[#64748B] hover:text-[#0F172A]">← Sessions</Link>
        <span className="text-[#CBD5E1]">/</span>
        <h1 className="text-xl font-bold text-[#0F172A]">New Session</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= n ? "bg-[#2E0BFC] text-white" : "bg-[#F1F5F9] text-[#94A3B8]"}`}>{n}</div>
            <span className={`text-sm ${step >= n ? "font-medium text-[#0F172A]" : "text-[#94A3B8]"}`}>{["Setup", "Candidates", "Questions"][n - 1]}</span>
            {n < 3 && <span className="mx-2 text-[#CBD5E1]">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Setup */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="max-w-lg space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#0F172A]">Session title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Batch A – June 2026" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-[#0F172A]">Start mode</label>
            <div className="flex gap-2">
              {(["manual", "scheduled"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setScheduleMode(m)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${scheduleMode === m ? "border-[#2E0BFC] bg-[#EEF2FF] text-[#2E0BFC]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}>
                  {m === "manual" ? "Manual start" : "Scheduled"}
                </button>
              ))}
            </div>
          </div>
          {scheduleMode === "scheduled" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#0F172A]">Date & time</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-center gap-3">
                <input id="autoStart" type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="h-4 w-4 rounded border-[#E2E8F0] accent-[#2E0BFC]" />
                <label htmlFor="autoStart" className="text-sm text-[#0F172A]">Auto-start at scheduled time</label>
              </div>
              {!autoStart && (
                <p className="text-xs text-[#64748B]">At the scheduled time, the Start button will unlock — you still need to click it to go live.</p>
              )}
            </>
          )}
          {step1Error && <p className="text-xs text-red-600">{step1Error}</p>}
          <button type="submit" disabled={step1Busy}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
            {step1Busy ? "Creating…" : "Continue →"}
          </button>
        </form>
      )}

      {/* Step 2: Candidates */}
      {step === 2 && session && (
        <div className="max-w-2xl">
          {/* Join link */}
          <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#64748B]">Join link</p>
              <p className="text-sm font-mono text-[#0F172A] mt-0.5">{typeof window !== "undefined" ? `${window.location.origin}/join/${session.joinToken}` : `/join/${session.joinToken}`}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${session.joinToken}`)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]">
              Copy
            </button>
          </div>

          {/* Sub-tabs */}
          <div className="mb-5 flex gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1 w-fit">
            {(["csv", "manual"] as const).map((t) => (
              <button key={t} onClick={() => setCandidateTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${candidateTab === t ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>
                {t === "csv" ? "CSV Upload" : "Add Manually"}
              </button>
            ))}
          </div>

          {candidateTab === "csv" && (
            <div className="space-y-4">
              <p className="text-xs text-[#64748B]">CSV must have a header row with columns: <code className="bg-[#F1F5F9] px-1 rounded">name, rollNumber, email</code>. Passwords are auto-generated.</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="text-sm text-[#64748B]" />
              {csvFile && !importResult && (
                <button onClick={handleCSVImport} disabled={csvBusy}
                  className="rounded-lg bg-[#2E0BFC] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {csvBusy ? "Importing…" : "Import CSV"}
                </button>
              )}
              {importError && <p className="text-xs text-red-600">{importError}</p>}
              {importResult && (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-3">
                  <p className="text-sm font-semibold text-[#0F172A]">{importResult.created.length} imported{importResult.skipped.length > 0 ? `, ${importResult.skipped.length} skipped` : ""}</p>
                  {importResult.skipped.length > 0 && (
                    <ul className="text-xs text-amber-700 space-y-0.5">{importResult.skipped.map((s, i) => <li key={i}>• {s}</li>)}</ul>
                  )}
                  <button onClick={() => downloadCredentials(importResult.created)}
                    className="rounded-lg border border-[#2E0BFC] px-4 py-2 text-sm font-semibold text-[#2E0BFC] hover:bg-[#EEF2FF]">
                    Download credential sheet
                  </button>
                </div>
              )}
            </div>
          )}

          {candidateTab === "manual" && (
            <div className="space-y-4">
              <form onSubmit={handleManualAdd} className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Name</label>
                  <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} className={inputCls} placeholder="Full name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Roll Number</label>
                  <input type="text" value={manualRoll} onChange={(e) => setManualRoll(e.target.value)} className={inputCls} placeholder="e.g. PC-0001" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Email</label>
                  <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
                </div>
                <div className="col-span-3">
                  {manualError && <p className="mb-2 text-xs text-red-600">{manualError}</p>}
                  <button type="submit" disabled={manualBusy}
                    className="rounded-lg bg-[#2E0BFC] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {manualBusy ? "Adding…" : "Add Candidate"}
                  </button>
                </div>
              </form>
              {manualAdded.length > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[#0F172A]">{manualAdded.length} added this session</p>
                    <button onClick={() => downloadCredentials(manualAdded)}
                      className="rounded-lg border border-[#2E0BFC] px-3 py-1 text-xs font-semibold text-[#2E0BFC] hover:bg-[#EEF2FF]">
                      Download credentials
                    </button>
                  </div>
                  <div className="space-y-1">
                    {manualAdded.map((c) => (
                      <div key={c.rollNumber} className="flex gap-3 text-xs text-[#64748B]">
                        <span className="font-mono">{c.rollNumber}</span>
                        <span>{c.name}</span>
                        <span>{c.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button onClick={() => setStep(3)}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
              Continue to Questions →
            </button>
            <button onClick={() => router.push(`/admin/session/${session.id}`)}
              className="rounded-lg border border-[#E2E8F0] px-5 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]">
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Questions */}
      {step === 3 && session && (
        <div className="max-w-2xl">
          <p className="mb-4 text-sm text-[#64748B]">
            Questions for this session are managed on the Questions page, scoped to this session.
          </p>
          <div className="flex gap-3">
            <a
              href={`/admin/questions?sessionId=${session.id}`}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}
            >
              Open Question Builder →
            </a>
            <button onClick={() => router.push(`/admin/session/${session.id}`)}
              className="rounded-lg border border-[#E2E8F0] px-5 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]">
              Go to Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
