"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  campaign: {
    name: string;
    status: string;
    durationSec: number;
    negativeMarking: boolean;
    startedAt: string | null;
    endedAt: string | null;
  };
  maxPossible: number;
  totalQuestions: number;
  scoreStats: {
    count: number;
    mean: number;
    median: number;
    mode: number;
    stdDev: number;
    min: number;
    max: number;
    p25: number;
    p75: number;
    passRate: number;
    passThreshold: number;
  };
  candidateStats: {
    total: number;
    completed: number;
    disqualified: number;
    noShow: number;
    completionRate: number;
    totalTabSwitches: number;
    avgTabSwitches: number;
    disqualifyReasons: { reason: string; count: number }[];
  };
  distribution: { label: string; count: number }[];
  questions: {
    id: string;
    orderIndex: number;
    text: string;
    type: string;
    basePoints: number;
    timeLimitSec: number;
    totalAnswered: number;
    correctCount: number;
    pValue: number;
    avgResponseMs: number;
    timeoutCount: number;
    optionFrequency: number[] | null;
    discriminationIndex: number;
  }[];
  testAssessment: {
    difficulty: string;
    difficultyScore: number;
    easiest: { text: string; pValue: number } | null;
    hardest: { text: string; pValue: number } | null;
    slowest: { text: string; avgMs: number } | null;
  };
  integrityStats: {
    totalTabSwitches: number;
    avgTabSwitchesPerCandidate: number;
    highRiskCount: number;
    disqualifiedForTabSwitch: number;
    disqualifiedForDuplicateLogin: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function difficultyColor(d: string) {
  if (d === "Easy") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (d === "Moderate") return "bg-amber-100 text-amber-700 border-amber-200";
  if (d === "Hard") return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function pValueColor(pv: number) {
  if (pv >= 70) return "bg-emerald-100 text-emerald-700";
  if (pv >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

function pValueLabel(pv: number) {
  if (pv >= 70) return "Easy";
  if (pv >= 40) return "Moderate";
  if (pv >= 20) return "Hard";
  return "Very Hard";
}

function discriminationLabel(d: number) {
  if (d >= 0.4) return { label: "Excellent", color: "text-emerald-600" };
  if (d >= 0.3) return { label: "Good", color: "text-blue-600" };
  if (d >= 0.2) return { label: "Acceptable", color: "text-amber-600" };
  if (d >= 0) return { label: "Weak", color: "text-orange-500" };
  return { label: "Problematic", color: "text-red-600" };
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCSV(data: AnalyticsData) {
  const rows: string[][] = [];

  rows.push(["ASSESSMENT ANALYTICS REPORT"]);
  rows.push(["Campaign", data.campaign.name]);
  rows.push(["Status", data.campaign.status]);
  rows.push(["Duration", fmtDuration(data.campaign.durationSec)]);
  rows.push(["Started", data.campaign.startedAt ? new Date(data.campaign.startedAt).toLocaleString() : "—"]);
  rows.push(["Ended", data.campaign.endedAt ? new Date(data.campaign.endedAt).toLocaleString() : "—"]);
  rows.push(["Negative Marking", data.campaign.negativeMarking ? "Yes" : "No"]);
  rows.push([]);

  rows.push(["SCORE STATISTICS"]);
  rows.push(["Metric", "Value"]);
  rows.push(["Candidates Completed", String(data.scoreStats.count)]);
  rows.push(["Maximum Possible Score", String(data.maxPossible)]);
  rows.push(["Mean Score", String(data.scoreStats.mean)]);
  rows.push(["Median Score", String(data.scoreStats.median)]);
  rows.push(["Mode Score", String(data.scoreStats.mode)]);
  rows.push(["Std Deviation", String(data.scoreStats.stdDev)]);
  rows.push(["Min Score", String(data.scoreStats.min)]);
  rows.push(["Max Score", String(data.scoreStats.max)]);
  rows.push(["25th Percentile", String(data.scoreStats.p25)]);
  rows.push(["75th Percentile", String(data.scoreStats.p75)]);
  rows.push(["Pass Rate (≥60%)", `${data.scoreStats.passRate}%`]);
  rows.push([]);

  rows.push(["CANDIDATE PARTICIPATION"]);
  rows.push(["Total Registered", String(data.candidateStats.total)]);
  rows.push(["Completed", `${data.candidateStats.completed} (${data.candidateStats.completionRate}%)`]);
  rows.push(["Disqualified", String(data.candidateStats.disqualified)]);
  rows.push(["No-Show", String(data.candidateStats.noShow)]);
  rows.push(["Total Tab Switches", String(data.integrityStats.totalTabSwitches)]);
  rows.push(["Avg Tab Switches per Candidate", String(data.integrityStats.avgTabSwitchesPerCandidate)]);
  rows.push([]);

  rows.push(["SCORE DISTRIBUTION"]);
  rows.push(["Bucket", "Candidates"]);
  for (const b of data.distribution) rows.push([b.label, String(b.count)]);
  rows.push([]);

  rows.push(["TEST DIFFICULTY"]);
  rows.push(["Overall Rating", data.testAssessment.difficulty]);
  rows.push(["Difficulty Score", `${data.testAssessment.difficultyScore}/100`]);
  if (data.testAssessment.easiest) rows.push(["Easiest Question", `${data.testAssessment.easiest.text.slice(0, 80)} (${data.testAssessment.easiest.pValue}% correct)`]);
  if (data.testAssessment.hardest) rows.push(["Hardest Question", `${data.testAssessment.hardest.text.slice(0, 80)} (${data.testAssessment.hardest.pValue}% correct)`]);
  rows.push([]);

  rows.push(["QUESTION ANALYSIS"]);
  rows.push(["#", "Question", "Type", "P-Value (%)", "Difficulty", "Avg Response Time", "Timeout Count", "Discrimination Index"]);
  for (const q of data.questions) {
    rows.push([
      String(q.orderIndex + 1),
      q.text.slice(0, 100),
      q.type.toUpperCase(),
      String(q.pValue),
      pValueLabel(q.pValue),
      fmtMs(q.avgResponseMs),
      String(q.timeoutCount),
      String(q.discriminationIndex),
    ]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.campaign.name.replace(/\s+/g, "-")}-analytics.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-[#0F172A]"}`}>{value}</p>
      {sub && <p className="text-xs text-[#94A3B8] mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qSort, setQSort] = useState<"order" | "pvalue" | "time">("order");

  useEffect(() => {
    fetch(`/api/admin/campaigns/${id}/analytics`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="h-8 w-8 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error ?? "No data"}</p>
        <Link href={`/admin/campaigns/${id}`} className="text-sm text-[#6366F1] hover:underline mt-2 inline-block">
          ← Back to campaign
        </Link>
      </div>
    );
  }

  const { scoreStats, candidateStats, distribution, questions, testAssessment, integrityStats } = data;
  const maxDistCount = Math.max(...distribution.map(b => b.count), 1);

  const sortedQuestions = [...questions].sort((a, b) => {
    if (qSort === "pvalue") return a.pValue - b.pValue;
    if (qSort === "time") return b.avgResponseMs - a.avgResponseMs;
    return a.orderIndex - b.orderIndex;
  });

  const scorePct = data.maxPossible > 0 ? Math.round((scoreStats.mean / data.maxPossible) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href={`/admin/campaigns/${id}`} className="text-xs text-[#64748B] hover:text-[#6366F1] flex items-center gap-1 mb-2">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {data.campaign.name}
          </Link>
          <h1 className="text-2xl font-bold text-[#0F172A]">Assessment Analytics</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${difficultyColor(testAssessment.difficulty)}`}>
              {testAssessment.difficulty} Assessment
            </span>
            {data.campaign.endedAt && (
              <span className="text-xs text-[#94A3B8]">
                Ended {new Date(data.campaign.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {data.campaign.durationSec > 0 && ` · ${fmtDuration(data.campaign.durationSec)} duration`}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/campaigns/${id}/results`}
            className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            View Results
          </Link>
          <button
            onClick={() => downloadCSV(data)}
            className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:bg-[#4F46E5] flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Report
          </button>
        </div>
      </div>

      {/* ── Section 1: Score Statistics ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-3">Score Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Mean"
            value={String(scoreStats.mean)}
            sub={`${scorePct}% of max`}
            accent="text-[#6366F1]"
          />
          <StatCard label="Median" value={String(scoreStats.median)} sub="middle value" />
          <StatCard label="Mode" value={String(scoreStats.mode)} sub="most common" />
          <StatCard label="Std Deviation" value={String(scoreStats.stdDev)} sub="spread" />
          <StatCard
            label="Range"
            value={`${scoreStats.min} – ${scoreStats.max}`}
            sub={`out of ${data.maxPossible}`}
          />
          <StatCard
            label="Pass Rate"
            value={`${scoreStats.passRate}%`}
            sub={`≥${scoreStats.passThreshold} pts`}
            accent={scoreStats.passRate >= 70 ? "text-emerald-600" : scoreStats.passRate >= 40 ? "text-amber-600" : "text-red-500"}
          />
        </div>

        {/* Percentile bar */}
        <div className="mt-3 rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-[#64748B] uppercase tracking-wide mb-3">Score Spread (0 → {data.maxPossible})</p>
          <div className="relative h-6 rounded-full bg-[#F1F5F9]">
            {/* IQR band */}
            <div
              className="absolute top-0 h-full rounded-full bg-[#EEF2FF]"
              style={{
                left: `${data.maxPossible > 0 ? (scoreStats.p25 / data.maxPossible) * 100 : 0}%`,
                width: `${data.maxPossible > 0 ? ((scoreStats.p75 - scoreStats.p25) / data.maxPossible) * 100 : 0}%`,
              }}
            />
            {/* Median line */}
            <div
              className="absolute top-0 w-0.5 h-full bg-[#6366F1]"
              style={{ left: `${data.maxPossible > 0 ? (scoreStats.median / data.maxPossible) * 100 : 0}%` }}
            />
            {/* Mean dot */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[#6366F1] border-2 border-white shadow"
              style={{ left: `calc(${data.maxPossible > 0 ? (scoreStats.mean / data.maxPossible) * 100 : 0}% - 8px)` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#94A3B8] mt-1.5">
            <span>Min: {scoreStats.min}</span>
            <span className="text-[#6366F1] font-medium">P25: {scoreStats.p25} · Median: {scoreStats.median} · P75: {scoreStats.p75}</span>
            <span>Max: {scoreStats.max}</span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Participation + Distribution side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Candidate Participation */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Candidate Participation</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-[#F8FAFC] p-3">
              <p className="text-xs text-[#64748B]">Total Registered</p>
              <p className="text-xl font-bold text-[#0F172A]">{candidateStats.total}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Completed</p>
              <p className="text-xl font-bold text-emerald-700">{candidateStats.completed}</p>
              <p className="text-xs text-emerald-500">{candidateStats.completionRate}%</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-xs text-red-500">Disqualified</p>
              <p className="text-xl font-bold text-red-600">{candidateStats.disqualified}</p>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] p-3">
              <p className="text-xs text-[#64748B]">No-Show</p>
              <p className="text-xl font-bold text-[#0F172A]">{candidateStats.noShow}</p>
            </div>
          </div>

          {/* Completion bar */}
          <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${candidateStats.completionRate}%` }} />
            <div className="h-full bg-red-400" style={{ width: `${candidateStats.total > 0 ? (candidateStats.disqualified / candidateStats.total) * 100 : 0}%` }} />
          </div>
          <div className="flex gap-4 mt-1.5 text-xs text-[#94A3B8]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Completed</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Disqualified</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#E2E8F0] inline-block" />No-Show</span>
          </div>

          {candidateStats.disqualifyReasons.length > 0 && (
            <div className="mt-4 border-t border-[#F1F5F9] pt-3">
              <p className="text-xs font-medium text-[#64748B] mb-2">Disqualification Reasons</p>
              {candidateStats.disqualifyReasons.map(r => (
                <div key={r.reason} className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#475569]">{r.reason}</span>
                  <span className="font-semibold text-red-500">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Score Distribution */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Score Distribution</h2>
          {scoreStats.count === 0 ? (
            <p className="text-sm text-[#94A3B8]">No completed candidates yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {distribution.map((b) => {
                const pct = maxDistCount > 0 ? Math.max(4, (b.count / maxDistCount) * 100) : 4;
                const isEmpty = b.count === 0;
                return (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-[#475569]">{isEmpty ? "" : b.count}</span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${isEmpty ? "bg-[#F1F5F9]" : "bg-[#6366F1]"}`}
                      style={{ height: `${pct}%` }}
                    />
                    <span className="text-[10px] text-[#94A3B8] text-center leading-tight">{b.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-[#94A3B8] mt-3">Distribution based on {scoreStats.count} completed candidate{scoreStats.count !== 1 ? "s" : ""}. Buckets = % of max score ({data.maxPossible} pts).</p>
        </section>
      </div>

      {/* ── Section 3: Test Difficulty ── */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm mb-8">
        <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Test Difficulty Assessment</h2>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <div className={`rounded-2xl border px-6 py-4 ${difficultyColor(testAssessment.difficulty)}`}>
              <p className="text-3xl font-extrabold">{testAssessment.difficulty}</p>
              <p className="text-xs mt-0.5 opacity-70">Difficulty Index: {testAssessment.difficultyScore}/100</p>
            </div>
          </div>
          <div className="flex-1 min-w-48 space-y-3">
            {testAssessment.easiest && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2">
                <p className="text-xs font-semibold text-emerald-600 mb-0.5">Easiest Question ({testAssessment.easiest.pValue}% correct)</p>
                <p className="text-sm text-[#0F172A] line-clamp-1">{testAssessment.easiest.text}</p>
              </div>
            )}
            {testAssessment.hardest && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-2">
                <p className="text-xs font-semibold text-red-500 mb-0.5">Hardest Question ({testAssessment.hardest.pValue}% correct)</p>
                <p className="text-sm text-[#0F172A] line-clamp-1">{testAssessment.hardest.text}</p>
              </div>
            )}
            {testAssessment.slowest && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-2">
                <p className="text-xs font-semibold text-amber-600 mb-0.5">Most Time-Consuming (avg {fmtMs(testAssessment.slowest.avgMs)})</p>
                <p className="text-sm text-[#0F172A] line-clamp-1">{testAssessment.slowest.text}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 4: Question Analysis ── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide">Question Analysis</h2>
          <div className="flex gap-1">
            {(["order", "pvalue", "time"] as const).map(s => (
              <button
                key={s}
                onClick={() => setQSort(s)}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${qSort === s ? "bg-[#6366F1] text-white" : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"}`}
              >
                {s === "order" ? "By Order" : s === "pvalue" ? "Hardest First" : "Slowest First"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">
                  <th className="px-4 py-3 w-8">#</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Answered</th>
                  <th className="px-4 py-3">Correct %</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Avg Time</th>
                  <th className="px-4 py-3">Timeouts</th>
                  <th className="px-4 py-3">Discrimination</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {sortedQuestions.map(q => {
                  const disc = discriminationLabel(q.discriminationIndex);
                  const timePct = q.timeLimitSec > 0
                    ? Math.min(100, (q.avgResponseMs / (q.timeLimitSec * 1000)) * 100)
                    : 0;
                  const isScorable = q.type === "mcq" || q.type === "image";
                  return (
                    <tr key={q.id} className="hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3 text-xs text-[#94A3B8] font-mono">{q.orderIndex + 1}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="truncate text-sm text-[#0F172A]" title={q.text}>{q.text}</p>
                        {q.optionFrequency && (
                          <div className="flex gap-1 mt-1">
                            {q.optionFrequency.map((freq, idx) => (
                              <span
                                key={idx}
                                className={`text-[10px] rounded px-1 py-0.5 font-medium ${isScorable && idx === (q as { correctOption?: number }).correctOption ? "bg-emerald-100 text-emerald-700" : "bg-[#F1F5F9] text-[#64748B]"}`}
                                title={`Option ${OPTION_LETTERS[idx]}: ${freq} chose this`}
                              >
                                {OPTION_LETTERS[idx]}: {freq}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569] uppercase">
                          {q.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#475569]">{q.totalAnswered}</td>
                      <td className="px-4 py-3">
                        {isScorable ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${q.pValue >= 70 ? "bg-emerald-500" : q.pValue >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${q.pValue}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-[#475569]">{q.pValue}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isScorable ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pValueColor(q.pValue)}`}>
                            {pValueLabel(q.pValue)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                            <div className={`h-full rounded-full ${timePct > 80 ? "bg-red-400" : timePct > 60 ? "bg-amber-400" : "bg-blue-400"}`} style={{ width: `${timePct}%` }} />
                          </div>
                          <span className="text-xs text-[#475569]">{fmtMs(q.avgResponseMs)}</span>
                        </div>
                        <p className="text-[10px] text-[#94A3B8]">of {q.timeLimitSec}s limit</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#475569]">
                        {q.timeoutCount > 0 ? (
                          <span className="text-amber-600 font-medium">{q.timeoutCount}</span>
                        ) : "0"}
                      </td>
                      <td className="px-4 py-3">
                        {isScorable ? (
                          <span className={`text-xs font-semibold ${disc.color}`}>
                            {disc.label}
                            <span className="font-normal text-[#94A3B8] ml-1">({q.discriminationIndex})</span>
                          </span>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#F1F5F9] bg-[#F8FAFC]">
            <p className="text-xs text-[#94A3B8]">
              P-Value = % of candidates who answered correctly.
              Discrimination Index = how well the question separates high-scoring from low-scoring candidates (≥0.3 is good).
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 5: Anti-cheat & Integrity ── */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm mb-8">
        <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Anti-Cheat & Integrity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[#64748B]">Total Tab Switches</p>
            <p className="text-2xl font-bold text-[#0F172A]">{integrityStats.totalTabSwitches}</p>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">Avg per Candidate</p>
            <p className="text-2xl font-bold text-[#0F172A]">{integrityStats.avgTabSwitchesPerCandidate}</p>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">Disq. for Tab Switching</p>
            <p className={`text-2xl font-bold ${integrityStats.disqualifiedForTabSwitch > 0 ? "text-red-500" : "text-[#0F172A]"}`}>
              {integrityStats.disqualifiedForTabSwitch}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#64748B]">Disq. for Dup. Login</p>
            <p className={`text-2xl font-bold ${integrityStats.disqualifiedForDuplicateLogin > 0 ? "text-red-500" : "text-[#0F172A]"}`}>
              {integrityStats.disqualifiedForDuplicateLogin}
            </p>
          </div>
        </div>
        {integrityStats.highRiskCount > 0 && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
            {integrityStats.highRiskCount} candidate{integrityStats.highRiskCount !== 1 ? "s" : ""} had at least one tab switch event detected.
          </p>
        )}
      </section>

    </div>
  );
}
