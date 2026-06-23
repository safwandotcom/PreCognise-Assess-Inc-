"use client";

import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth-store";
import { useBranding } from "@/lib/use-branding";

// ─── Types ─────────────────────────────────────────────────────────────────

interface QuestionBreakdown {
  questionId: string;
  questionText: string;
  questionType: string;
  orderIndex: number;
  basePoints: number;
  speedBonusMax: number;
  timeLimitSec: number;
  answered: boolean;
  correct: boolean | null;
  score: number;
  baseAwarded: number;
  speedBonusAwarded: number;
  responseTimeMs: number;
}

interface ScoreResponse {
  totalScore: number;
  questionsAnswered: number;
  questionsCorrect: number;
  totalQuestions: number;
  totalScoredQuestions: number;
  speedBonusTotal: number;
  baseScoreTotal: number;
  maxPossibleScore: number;
  maxBaseScore: number;
  maxSpeedBonus: number;
  percentileRank: number | null;
  peersCompleted: number;
  breakdown: QuestionBreakdown[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function pct(value: number, max: number) {
  return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

function formatMs(ms: number): string {
  if (ms === 0) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const TYPE_BADGE: Record<string, string> = {
  mcq:          "bg-indigo-50 text-indigo-700",
  image:        "bg-teal-50 text-teal-700",
  psychometric: "bg-purple-50 text-purple-700",
  rating:       "bg-amber-50 text-amber-700",
};

const TYPE_LABEL: Record<string, string> = {
  mcq: "MCQ", image: "Image", psychometric: "Psych", rating: "Rating",
};

// ─── Score ring ─────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  max,
  colour,
}: {
  score: number;
  max: number;
  colour: string;
}) {
  const radius = 60;
  const stroke = 10;
  const size = (radius + stroke) * 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = pct(score, max);
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (percentage / 100) * circumference);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage, circumference]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#1f2937" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-bold text-white">{score}</span>
        <span className="text-xs text-gray-500">/ {max} pts</span>
      </div>
    </div>
  );
}

// ─── Percentile bar ─────────────────────────────────────────────────────────

function PercentileBar({ rank, colour }: { rank: number; colour: string }) {
  const [width, setWidth] = useState(0);
  const label =
    rank >= 90 ? "Top 10%" :
    rank >= 75 ? "Top 25%" :
    rank >= 50 ? "Top 50%" :
    rank >= 25 ? "Top 75%" : "Bottom 25%";

  useEffect(() => {
    const timer = setTimeout(() => setWidth(rank), 150);
    return () => clearTimeout(timer);
  }, [rank]);

  return (
    <div className="w-full max-w-xs text-center">
      <p className="mb-1 text-sm font-semibold text-white">{label}</p>
      <p className="mb-3 text-xs text-gray-400">
        Better than {rank}% of candidates
      </p>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${width}%`,
            backgroundColor: colour,
            transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow"
          style={{
            left: `calc(${width}% - 8px)`,
            transition: "left 1.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-600">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

// ─── Score breakdown bar ────────────────────────────────────────────────────

function BreakdownBar({
  label,
  value,
  max,
  colour,
  prefix = "",
}: {
  label: string;
  value: number;
  max: number;
  colour: string;
  prefix?: string;
}) {
  const [width, setWidth] = useState(0);
  const p = pct(value, max);

  useEffect(() => {
    const t = setTimeout(() => setWidth(p), 200);
    return () => clearTimeout(t);
  }, [p]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-white">
          {prefix}{value} <span className="text-xs text-gray-500">/ {max}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            backgroundColor: colour,
            transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Question breakdown table ───────────────────────────────────────────────

function BreakdownTable({ rows }: { rows: QuestionBreakdown[] }) {
  const [open, setOpen] = useState(false);
  const isScorable = (type: string) => type === "mcq" || type === "image";

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-white hover:bg-gray-700/50"
      >
        <span>Question-by-question breakdown</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-right">Time</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q, i) => {
                const scorable = isScorable(q.questionType);
                let rowBg = "";
                if (!q.answered) rowBg = "opacity-40";
                else if (scorable && q.correct) rowBg = "";
                else if (scorable && !q.correct) rowBg = "";

                let resultIcon = null;
                if (!q.answered) {
                  resultIcon = <span className="text-gray-600">—</span>;
                } else if (scorable && q.correct) {
                  resultIcon = <span className="text-emerald-500">✓</span>;
                } else if (scorable && !q.correct) {
                  resultIcon = <span className="text-red-400">✗</span>;
                } else {
                  resultIcon = <span className="text-purple-400">●</span>;
                }

                return (
                  <tr
                    key={q.questionId}
                    className={`border-b border-gray-700/50 last:border-0 ${i % 2 === 0 ? "bg-gray-800" : "bg-gray-800/50"} ${rowBg}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {String(i + 1).padStart(2, "0")} {resultIcon}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[q.questionType] ?? "bg-gray-700 text-gray-300"}`}>
                        {TYPE_LABEL[q.questionType] ?? q.questionType}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-gray-300">
                      <span className="line-clamp-1" title={q.questionText}>
                        {q.questionText}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-400">
                      {q.answered ? formatMs(q.responseTimeMs) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!q.answered ? (
                        <span className="text-gray-600">0</span>
                      ) : (
                        <span className="font-semibold text-white">
                          {q.baseAwarded}
                          {q.speedBonusAwarded > 0 && (
                            <span className="ml-1 text-xs text-amber-400">+{q.speedBonusAwarded}</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ResultPage() {
  const branding = useBranding();
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch("/api/assessment/score", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then(setScore)
      .catch(() => setError("Couldn't load your result. Please refresh."));
  }, []);

  const col = branding.primaryColour;

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!score) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: col, borderTopColor: "transparent" }} />
        <p className="text-sm text-gray-500">Calculating your result…</p>
      </main>
    );
  }

  const overallPct = pct(score.totalScore, score.maxPossibleScore);

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 bg-gray-900 px-4 py-12 text-center">

      {/* Org header */}
      <div>
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.orgName} className="mx-auto mb-2 h-8 max-w-[160px] object-contain" />
        ) : (
          <p className="text-xs uppercase tracking-widest text-gray-500">{branding.orgName}</p>
        )}
        <h1 className="mt-1 text-2xl font-semibold text-white">Assessment complete</h1>
      </div>

      {/* Score ring */}
      <div className="flex flex-col items-center gap-3">
        <ScoreRing score={score.totalScore} max={score.maxPossibleScore} colour={col} />
        <p className="text-sm text-gray-400">{overallPct}% of max score</p>
      </div>

      {/* Percentile */}
      {score.percentileRank !== null && score.peersCompleted >= 2 && (
        <PercentileBar rank={score.percentileRank} colour={col} />
      )}

      {/* Stats row */}
      <div className="flex gap-8 text-sm text-gray-400">
        <div>
          <p className="text-2xl font-bold text-white">
            {score.questionsCorrect}
            <span className="text-base font-normal text-gray-500">/{score.totalScoredQuestions}</span>
          </p>
          <p>Correct</p>
        </div>
        <div className="h-full w-px bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-white">
            {score.questionsAnswered}
            <span className="text-base font-normal text-gray-500">/{score.totalQuestions}</span>
          </p>
          <p>Answered</p>
        </div>
        <div className="h-full w-px bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-amber-400">+{score.speedBonusTotal}</p>
          <p>Speed bonus</p>
        </div>
      </div>

      {/* Score breakdown bars */}
      {score.maxPossibleScore > 0 && (
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-700 bg-gray-800 p-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score breakdown</p>
          <BreakdownBar
            label="Base score"
            value={score.baseScoreTotal}
            max={score.maxBaseScore}
            colour={col}
          />
          {score.maxSpeedBonus > 0 && (
            <BreakdownBar
              label="Speed bonus"
              value={score.speedBonusTotal}
              max={score.maxSpeedBonus}
              colour="#F59E0B"
              prefix="+"
            />
          )}
          <div className="border-t border-gray-700 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total</span>
              <span className="font-bold text-white">{score.totalScore} / {score.maxPossibleScore} pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Question breakdown (collapsible) */}
      {score.breakdown.length > 0 && (
        <BreakdownTable rows={score.breakdown} />
      )}

      {/* Footer */}
      <p className="text-xs text-gray-700">
        Assessment powered by {branding.orgName}
      </p>
    </main>
  );
}
