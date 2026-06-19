// components/admin/CandidateGrid.tsx
"use client";

export interface AdminCandidate {
  id: string;
  rollNumber: string;
  name: string;
  country: string | null;
  status: "REGISTERED" | "JOINED" | "ACTIVE" | "COMPLETED" | "DISQUALIFIED";
  disqualifyReason: string | null;
  tabSwitchCount: number;
}

interface CandidateGridProps {
  candidates: AdminCandidate[];
}

const STATUS_STYLE: Record<AdminCandidate["status"], string> = {
  ACTIVE: "bg-green-500/20 border-green-500 text-green-300",
  DISQUALIFIED: "bg-red-500/20 border-red-500 text-red-300",
  COMPLETED: "bg-blue-500/20 border-blue-500 text-blue-300",
  REGISTERED: "bg-gray-500/20 border-gray-500 text-gray-300",
  JOINED: "bg-gray-500/20 border-gray-500 text-gray-300",
};

export default function CandidateGrid({ candidates }: CandidateGridProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-gray-500">No candidates yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {candidates.map((c) => (
        <div
          key={c.id}
          className={`rounded-lg border p-3 ${STATUS_STYLE[c.status]}`}
        >
          <p className="truncate text-sm font-semibold">{c.name}</p>
          <p className="text-xs opacity-80">#{c.rollNumber}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide">
            {c.status}
          </p>
          {c.status === "DISQUALIFIED" && c.disqualifyReason && (
            <p className="mt-1 text-[11px] opacity-70">
              {c.disqualifyReason}
            </p>
          )}
          {c.tabSwitchCount > 0 && c.status !== "DISQUALIFIED" && (
            <p className="mt-1 text-[11px] text-yellow-400">
              {c.tabSwitchCount} tab switch{c.tabSwitchCount > 1 ? "es" : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}