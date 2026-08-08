// app/admin/campaigns/[id]/results/[candidateId]/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface CandidateDetailItem {
  questionId: string;
  type: string;
  text: string;
  basePoints: number;
  wordLimit: number | null;
  response: {
    id: string;
    answer: unknown;
    score: number;
    needsGrading: boolean;
    gradedAt: string | null;
  } | null;
}

interface CandidateDetailData {
  candidate: {
    id: string;
    name: string;
    email: string;
    accessId: string;
    status: string;
  };
  items: CandidateDetailItem[];
}

function GradableRow({
  item,
  onGraded,
}: {
  item: CandidateDetailItem;
  onGraded: (questionId: string, score: number, gradedAt: string) => void;
}) {
  const [scoreInput, setScoreInput] = useState(String(item.response?.score ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!item.response) return;
    setError("");
    const score = Number(scoreInput);
    if (!Number.isFinite(score) || score < 0 || score > item.basePoints) {
      setError(`Score must be between 0 and ${item.basePoints}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/responses/${item.response.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save grade");
        return;
      }
      onGraded(item.questionId, score, new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
          {item.type === "short_answer" ? "Short Answer" : "Long Answer"}
        </span>
        {item.response?.needsGrading && !item.response.gradedAt && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Pending review
          </span>
        )}
        {item.response?.gradedAt && (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Graded
          </span>
        )}
      </div>
      <p className="mb-3 text-sm font-medium text-[#0F172A]">{item.text}</p>
      {item.response ? (
        <p className="mb-4 whitespace-pre-line rounded-lg bg-[#F8FAFC] p-3 text-sm text-[#334155]">
          {String(item.response.answer ?? "")}
        </p>
      ) : (
        <p className="mb-4 text-sm italic text-[#94A3B8]">No answer submitted.</p>
      )}
      {item.response && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-[#0F172A]">Score</label>
          <input
            type="number"
            min={0}
            max={item.basePoints}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            className="w-20 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
          />
          <span className="text-xs text-[#64748B]">/ {item.basePoints}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto rounded-lg bg-[#6366F1] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save grade"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = use(params);
  const [data, setData] = useState<CandidateDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/campaigns/${id}/results/${candidateId}`);
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to load candidate detail");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load candidate detail");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, candidateId]);

  function handleGraded(questionId: string, score: number, gradedAt: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.questionId === questionId && item.response
            ? { ...item, response: { ...item.response, score, gradedAt } }
            : item
        ),
      };
    });
  }

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

  const gradableItems = data.items.filter(
    (item) => item.type === "short_answer" || item.type === "long_answer"
  );

  return (
    <div className="px-7 py-6">
      <div className="mb-6">
        <Link
          href={`/admin/campaigns/${id}/results`}
          className="text-xs text-[#64748B] hover:text-[#0F172A]"
        >
          ← Back to Results
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[#0F172A]">{data.candidate.name}</h1>
        <p className="text-sm text-[#64748B]">
          {data.candidate.email} · {data.candidate.accessId}
        </p>
      </div>

      {gradableItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center">
          <p className="text-sm text-[#64748B]">
            This candidate has no Short Answer or Long Answer questions to review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gradableItems.map((item) => (
            <GradableRow key={item.questionId} item={item} onGraded={handleGraded} />
          ))}
        </div>
      )}
    </div>
  );
}
