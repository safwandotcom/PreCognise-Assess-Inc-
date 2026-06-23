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

const STATUS_STYLE: Record<AdminCandidate["status"], { badge: string; dot: string }> = {
  REGISTERED:   { badge: "bg-slate-50 border-slate-200 text-slate-600",       dot: "bg-slate-400" },
  JOINED:       { badge: "bg-amber-50 border-amber-200 text-amber-700",        dot: "bg-amber-500" },
  ACTIVE:       { badge: "bg-emerald-50 border-emerald-200 text-emerald-700",  dot: "bg-emerald-500" },
  COMPLETED:    { badge: "bg-blue-50 border-blue-200 text-blue-700",           dot: "bg-blue-500" },
  DISQUALIFIED: { badge: "bg-red-50 border-red-200 text-red-700",              dot: "bg-red-500" },
};

export default function CandidateGrid({ candidates }: CandidateGridProps) {
  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9]">
          <svg className="h-5 w-5 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#64748B]">No candidates yet</p>
        <p className="mt-1 text-xs text-[#94A3B8]">Candidates will appear here once they join</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {candidates.map((c) => {
        const { badge, dot } = STATUS_STYLE[c.status];
        return (
          <div key={c.id} className={`rounded-xl border p-3 ${badge}`}>
            <p className="truncate text-sm font-semibold text-[#0F172A]">{c.name}</p>
            <p className="text-xs text-[#64748B]">#{c.rollNumber}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              <p className="text-[11px] font-medium uppercase tracking-wide">{c.status}</p>
            </div>
            {c.status === "DISQUALIFIED" && c.disqualifyReason && (
              <p className="mt-1 text-[11px] text-red-600 opacity-80 line-clamp-2">
                {c.disqualifyReason}
              </p>
            )}
            {c.tabSwitchCount > 0 && c.status !== "DISQUALIFIED" && (
              <p className="mt-1 text-[11px] text-amber-600">
                {c.tabSwitchCount} tab switch{c.tabSwitchCount > 1 ? "es" : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
