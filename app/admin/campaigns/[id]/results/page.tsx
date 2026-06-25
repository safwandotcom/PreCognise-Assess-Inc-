"use client";

import React, { use, useEffect, useState, useMemo } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CandidateResult {
  rank: number;
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  tabSwitchCount: number;
  disqualifyReason: string | null;
  totalScore: number;
  rawScore: number;
  correctCount: number;
  answeredCount: number;
}

interface ResultsData {
  campaign: {
    name: string;
    negativeMarking: boolean;
    durationSec: number;
  };
  totalQuestions: number;
  maxPossibleScore: number;
  candidates: CandidateResult[];
}

type StatusFilter = "ALL" | "COMPLETED" | "DISQUALIFIED" | "OTHER";
type SortField = "rank" | "name" | "score" | "correct";
type SortDir = "asc" | "desc";

// ─── Status badge styles ──────────────────────────────────────────────────────

const CANDIDATE_STATUS_STYLES: Record<string, string> = {
  REGISTERED: "bg-gray-100 text-gray-600",
  JOINED: "bg-blue-50 text-blue-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-indigo-50 text-indigo-700",
  DISQUALIFIED: "bg-red-50 text-red-600",
};

// ─── Score progress bar colour ────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-400";
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active)
    return (
      <svg
        className="ml-1 inline h-3.5 w-3.5 text-[#CBD5E1]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  return dir === "asc" ? (
    <svg
      className="ml-1 inline h-3.5 w-3.5 text-[#6366F1]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  ) : (
    <svg
      className="ml-1 inline h-3.5 w-3.5 text-[#6366F1]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ─── CSV download ─────────────────────────────────────────────────────────────

function downloadCSV(
  candidates: CandidateResult[],
  maxPossibleScore: number,
  totalQuestions: number,
  campaignName: string
) {
  const header =
    "Rank,Name,Access ID,Email,Score,Max Score,Correct,Total Questions,Answered,Status,Tab Switches,Disqualify Reason";
  const rows = candidates.map((c) =>
    [
      c.rank,
      `"${c.name.replace(/"/g, '""')}"`,
      c.accessId,
      c.email,
      c.totalScore,
      maxPossibleScore,
      c.correctCount,
      totalQuestions,
      c.answeredCount,
      c.status,
      c.tabSwitchCount,
      c.disqualifyReason ? `"${c.disqualifyReason.replace(/"/g, '""')}"` : "",
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${campaignName.toLowerCase().replace(/\s+/g, "-")}-results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    async function fetchResults() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/campaigns/${id}/results`);
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to load results");
          return;
        }
        const d: ResultsData = await res.json();
        setData(d);
      } catch {
        setError("Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [id]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "rank" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data.candidates];

    // Status filter
    if (statusFilter === "COMPLETED") {
      list = list.filter((c) => c.status === "COMPLETED");
    } else if (statusFilter === "DISQUALIFIED") {
      list = list.filter((c) => c.status === "DISQUALIFIED");
    } else if (statusFilter === "OTHER") {
      list = list.filter(
        (c) => c.status !== "COMPLETED" && c.status !== "DISQUALIFIED"
      );
    }

    // Score range filter
    if (minScore !== "") {
      const min = Number(minScore);
      list = list.filter((c) => c.totalScore >= min);
    }
    if (maxScore !== "") {
      const max = Number(maxScore);
      list = list.filter((c) => c.totalScore <= max);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "rank") cmp = a.rank - b.rank;
      else if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "score") cmp = a.totalScore - b.totalScore;
      else if (sortField === "correct") cmp = a.correctCount - b.correctCount;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [data, statusFilter, minScore, maxScore, sortField, sortDir]);

  // Summary stats
  const completedCount = data
    ? data.candidates.filter((c) => c.status === "COMPLETED").length
    : 0;
  const avgScore =
    data && completedCount > 0
      ? Math.round(
          data.candidates
            .filter((c) => c.status === "COMPLETED")
            .reduce((s, c) => s + c.totalScore, 0) / completedCount
        )
      : 0;
  const topScore =
    data && data.candidates.length > 0
      ? Math.max(...data.candidates.map((c) => c.totalScore))
      : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6366F1] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-7 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="px-7 py-6">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              href={`/admin/campaigns/${id}`}
              className="text-xs text-[#64748B] hover:text-[#0F172A]"
            >
              ← Back to Campaign
            </Link>
          </div>
          <h1 className="text-xl font-bold text-[#0F172A]">
            {data.campaign.name} — Results
          </h1>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadCSV(
              data.candidates,
              data.maxPossibleScore,
              data.totalQuestions,
              data.campaign.name
            )
          }
          className="flex shrink-0 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] shadow-sm hover:bg-[#F1F5F9] transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Download CSV
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Total candidates",
            value: data.candidates.length,
            sub: null,
          },
          {
            label: "Completed",
            value: completedCount,
            sub:
              data.candidates.length > 0
                ? `${Math.round((completedCount / data.candidates.length) * 100)}%`
                : "0%",
          },
          {
            label: "Avg score (completed)",
            value: avgScore,
            sub: `/ ${data.maxPossibleScore}`,
          },
          {
            label: "Top score",
            value: topScore,
            sub: `/ ${data.maxPossibleScore}`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
          >
            <p className="text-xs font-medium text-[#64748B]">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">
              {card.value}
              {card.sub && (
                <span className="ml-1 text-sm font-normal text-[#64748B]">
                  {card.sub}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filters bar ── */}
      <div className="mb-4 rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Status filter buttons */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { value: "ALL", label: "All" },
                { value: "COMPLETED", label: "Completed" },
                { value: "DISQUALIFIED", label: "Disqualified" },
                { value: "OTHER", label: "Other" },
              ] as { value: StatusFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? "border-[#6366F1] bg-[#6366F1] text-white"
                    : "border-[#E2E8F0] text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Score range */}
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <span className="font-medium">Score:</span>
            <input
              type="number"
              placeholder="Min"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="w-20 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#6366F1]"
            />
            <span>–</span>
            <input
              type="number"
              placeholder="Max"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className="w-20 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#6366F1]"
            />
          </div>

          {/* Count */}
          <p className="ml-auto text-xs text-[#64748B]">
            Showing{" "}
            <span className="font-semibold text-[#0F172A]">{filtered.length}</span>{" "}
            of{" "}
            <span className="font-semibold text-[#0F172A]">
              {data.candidates.length}
            </span>{" "}
            candidates
          </p>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#64748B]">No candidates match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  <th
                    className="cursor-pointer select-none px-5 py-3 text-left"
                    onClick={() => handleSort("rank")}
                  >
                    Rank
                    <SortIcon active={sortField === "rank"} dir={sortDir} />
                  </th>
                  <th
                    className="cursor-pointer select-none px-5 py-3 text-left"
                    onClick={() => handleSort("name")}
                  >
                    Name
                    <SortIcon active={sortField === "name"} dir={sortDir} />
                  </th>
                  <th className="px-5 py-3 text-left">Access ID</th>
                  <th
                    className="cursor-pointer select-none px-5 py-3 text-left"
                    onClick={() => handleSort("score")}
                  >
                    Score / Max
                    <SortIcon active={sortField === "score"} dir={sortDir} />
                  </th>
                  <th
                    className="cursor-pointer select-none px-5 py-3 text-left"
                    onClick={() => handleSort("correct")}
                  >
                    Correct
                    <SortIcon active={sortField === "correct"} dir={sortDir} />
                  </th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Tab Switches</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const pct =
                    data.maxPossibleScore > 0
                      ? Math.round((c.totalScore / data.maxPossibleScore) * 100)
                      : 0;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className={`border-b border-[#E2E8F0] ${
                          i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"
                        }`}
                      >
                        {/* Rank */}
                        <td className="px-5 py-3 font-semibold text-[#0F172A]">
                          #{c.rank}
                        </td>

                        {/* Name (+ disqualify reason on sub-row) */}
                        <td className="px-5 py-3">
                          <p className="font-medium text-[#0F172A]">{c.name}</p>
                          <p className="text-xs text-[#64748B]">{c.email}</p>
                          {c.status === "DISQUALIFIED" && c.disqualifyReason && (
                            <p className="mt-0.5 text-xs text-[#94A3B8] italic">
                              {c.disqualifyReason.length > 60
                                ? c.disqualifyReason.slice(0, 60) + "…"
                                : c.disqualifyReason}
                            </p>
                          )}
                        </td>

                        {/* Access ID */}
                        <td className="px-5 py-3 font-mono text-xs font-semibold text-[#6366F1]">
                          {c.accessId}
                        </td>

                        {/* Score with progress bar */}
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-[#0F172A]">
                            {c.totalScore}{" "}
                            <span className="text-xs font-normal text-[#64748B]">
                              / {data.maxPossibleScore}
                            </span>
                          </p>
                          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[#E2E8F0]">
                            <div
                              className={`h-full rounded-full transition-all ${scoreColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>

                        {/* Correct */}
                        <td className="px-5 py-3 text-[#0F172A]">
                          {c.correctCount}{" "}
                          <span className="text-xs text-[#64748B]">
                            / {data.totalQuestions}
                          </span>
                        </td>

                        {/* Status badge */}
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              CANDIDATE_STATUS_STYLES[c.status] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>

                        {/* Tab switches */}
                        <td className="px-5 py-3">
                          <span
                            className={`text-sm font-medium ${
                              c.tabSwitchCount > 0
                                ? "text-amber-600"
                                : "text-[#64748B]"
                            }`}
                          >
                            {c.tabSwitchCount}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
