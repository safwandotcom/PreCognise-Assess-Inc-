"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

type QuestionType = "mcq" | "psychometric" | "rating" | "image";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctOption: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}

const EMPTY_FORM: Omit<Question, "id" | "orderIndex"> = {
  type: "mcq",
  text: "",
  imageUrl: null,
  options: ["", "", "", ""],
  correctOption: 0,
  timeLimitSec: 30,
  basePoints: 10,
  speedBonusMax: 5,
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "MCQ",
  psychometric: "Psychometric",
  rating: "Rating",
  image: "Image MCQ",
};

const TYPE_COLOURS: Record<QuestionType, string> = {
  mcq: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  psychometric: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  rating: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  image: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
};

function needsOptions(type: QuestionType) {
  return type === "mcq" || type === "image";
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: QuestionType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOURS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E8E6DF] bg-white py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F4F3EE]">
        <svg className="h-7 w-7 text-[#6B6A63]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="font-medium text-[#1A1B23]">No questions yet</p>
      <p className="mt-1 text-sm text-[#6B6A63]">Add your first question to get started.</p>
      <button
        onClick={onAdd}
        className="mt-5 rounded-lg bg-[#3730A3] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2D2785]"
      >
        Add question
      </button>
    </div>
  );
}

// ─── Question form (create / edit) ─────────────────────────────────────────

interface QuestionFormProps {
  initial: Omit<Question, "id" | "orderIndex">;
  onSave: (data: Omit<Question, "id" | "orderIndex">) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  mode: "create" | "edit";
}

function QuestionForm({ initial, onSave, onCancel, saving, mode }: QuestionFormProps) {
  const [form, setForm] = useState(initial);

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setOption(index: number, value: string) {
    const next = [...form.options];
    next[index] = value;
    setForm((f) => ({ ...f, options: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(form);
  }

  const showOptions = needsOptions(form.type);
  const showCorrect = showOptions;
  const showImage = form.type === "image";
  const alwaysAwards = form.type === "psychometric" || form.type === "rating";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Question type</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["mcq", "image", "psychometric", "rating"] as QuestionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setField("type", t)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                form.type === t
                  ? "border-[#3730A3] bg-[#3730A3] text-white"
                  : "border-[#E8E6DF] bg-white text-[#6B6A63] hover:border-[#3730A3] hover:text-[#3730A3]"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Question text</label>
        <textarea
          required
          rows={3}
          value={form.text}
          onChange={(e) => setField("text", e.target.value)}
          placeholder="Enter the question..."
          className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
        />
      </div>

      {/* Image URL (image MCQ only) */}
      {showImage && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Image URL</label>
          <input
            type="url"
            value={form.imageUrl ?? ""}
            onChange={(e) => setField("imageUrl", e.target.value || null)}
            placeholder="https://..."
            className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
          />
          <p className="mt-1 text-xs text-[#6B6A63]">Paste a public image URL. File upload coming soon.</p>
        </div>
      )}

      {/* Options (MCQ / Image) */}
      {showOptions && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Options</label>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[#E8E6DF] bg-[#F4F3EE] text-xs font-semibold text-[#6B6A63]">
                  {String.fromCharCode(65 + i)}
                </span>
                <input
                  required={showOptions}
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="flex-1 rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2 text-sm text-[#1A1B23] placeholder-[#6B6A63] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correct option */}
      {showCorrect && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Correct answer</label>
          <div className="flex gap-2">
            {form.options.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setField("correctOption", i)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                  form.correctOption === i
                    ? "bg-[#3730A3] text-white"
                    : "border border-[#E8E6DF] bg-white text-[#6B6A63] hover:border-[#3730A3]"
                }`}
              >
                {String.fromCharCode(65 + i)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timing & scoring */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Timer (sec)</label>
          <input
            type="number"
            required
            min={5}
            max={300}
            value={form.timeLimitSec}
            onChange={(e) => setField("timeLimitSec", Number(e.target.value))}
            className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Base points</label>
          <input
            type="number"
            required
            min={0}
            value={form.basePoints}
            onChange={(e) => setField("basePoints", Number(e.target.value))}
            className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#1A1B23]">Speed bonus</label>
          <input
            type="number"
            min={0}
            value={form.speedBonusMax}
            onChange={(e) => setField("speedBonusMax", Number(e.target.value))}
            className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3.5 py-2.5 text-sm text-[#1A1B23] outline-none focus:border-[#3730A3] focus:ring-2 focus:ring-[#3730A3]/10"
          />
        </div>
      </div>

      {alwaysAwards && (
        <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
          This question type always awards base points on any answer — there is no wrong answer.
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-[#E8E6DF] pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#3730A3] px-5 py-2 text-sm font-medium text-white hover:bg-[#2D2785] disabled:opacity-60"
        >
          {saving ? "Saving…" : mode === "create" ? "Add question" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Modal wrapper ──────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E8E6DF] px-6 py-4">
          <h2 className="text-base font-semibold text-[#1A1B23]">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#6B6A63] hover:bg-[#F4F3EE]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/questions");
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } catch {
      setError("Failed to load questions.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleCreate(data: Omit<Question, "id" | "orderIndex">) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      setShowCreate(false);
      await load();
    } catch {
      alert("Failed to create question. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: Omit<Question, "id" | "orderIndex">) {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/questions/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      setEditTarget(null);
      await load();
    } catch {
      alert("Failed to update question. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/questions/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setDeleteTarget(null);
      await load();
    } catch {
      alert("Failed to delete question. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    try {
      await fetch("/api/admin/questions/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, direction }),
      });
      await load();
    } catch {
      alert("Failed to reorder. Please try again.");
    }
  }

  const totalPoints = questions.reduce((sum, q) => sum + q.basePoints + q.speedBonusMax, 0);

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="border-b border-[#E8E6DF] bg-white">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Link href="/admin" className="text-sm text-[#6B6A63] hover:text-[#1A1B23]">
            ← Admin dashboard
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#1A1B23]">
                Question Builder
              </h1>
              <p className="mt-0.5 text-sm text-[#6B6A63]">
                {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalPoints} total points
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-[#3730A3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2D2785]"
            >
              + Add question
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#3730A3] border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 px-5 py-4 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {!loading && !error && questions.length === 0 && (
          <EmptyState onAdd={() => setShowCreate(true)} />
        )}

        {!loading && !error && questions.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white">
            {/* Table header */}
            <div className="grid grid-cols-[2rem_1fr_7rem_6rem_6rem_7rem] items-center gap-4 border-b border-[#E8E6DF] bg-[#FAFAF8] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#6B6A63]">
              <span>#</span>
              <span>Question</span>
              <span>Type</span>
              <span className="text-right">Timer</span>
              <span className="text-right">Points</span>
              <span className="text-right">Actions</span>
            </div>

            {questions.map((q, idx) => (
              <div
                key={q.id}
                className={`grid grid-cols-[2rem_1fr_7rem_6rem_6rem_7rem] items-center gap-4 px-5 py-4 text-sm ${
                  idx % 2 === 0 ? "bg-white" : "bg-[#FAFAF8]"
                } ${idx < questions.length - 1 ? "border-b border-[#E8E6DF]" : ""}`}
              >
                {/* Number */}
                <span className="font-mono text-xs font-semibold text-[#6B6A63]">
                  {String(idx + 1).padStart(2, "0")}
                </span>

                {/* Text */}
                <p className="truncate font-medium text-[#1A1B23]" title={q.text}>
                  {q.text}
                </p>

                {/* Type */}
                <div>
                  <TypeBadge type={q.type} />
                </div>

                {/* Timer */}
                <span className="text-right text-[#6B6A63]">{q.timeLimitSec}s</span>

                {/* Points */}
                <span className="text-right text-[#6B6A63]">
                  {q.basePoints}
                  {q.speedBonusMax > 0 && (
                    <span className="ml-1 text-xs text-amber-600">+{q.speedBonusMax}</span>
                  )}
                </span>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleReorder(q.id, "up")}
                    disabled={idx === 0}
                    title="Move up"
                    className="rounded p-1 text-[#6B6A63] hover:bg-[#F4F3EE] disabled:opacity-20"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleReorder(q.id, "down")}
                    disabled={idx === questions.length - 1}
                    title="Move down"
                    className="rounded p-1 text-[#6B6A63] hover:bg-[#F4F3EE] disabled:opacity-20"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditTarget(q)}
                    title="Edit"
                    className="rounded p-1 text-[#6B6A63] hover:bg-[#F4F3EE]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 112.97 2.97L7.5 19.79l-4 1 1-4 12.362-12.303z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(q)}
                    title="Delete"
                    className="rounded p-1 text-red-400 hover:bg-red-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Add question" onClose={() => setShowCreate(false)}>
          <QuestionForm
            initial={{ ...EMPTY_FORM }}
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            saving={saving}
            mode="create"
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title="Edit question" onClose={() => setEditTarget(null)}>
          <QuestionForm
            initial={{
              type: editTarget.type,
              text: editTarget.text,
              imageUrl: editTarget.imageUrl,
              options: editTarget.options.length === 4 ? editTarget.options as string[] : ["", "", "", ""],
              correctOption: editTarget.correctOption,
              timeLimitSec: editTarget.timeLimitSec,
              basePoints: editTarget.basePoints,
              speedBonusMax: editTarget.speedBonusMax,
            }}
            onSave={handleEdit}
            onCancel={() => setEditTarget(null)}
            saving={saving}
            mode="edit"
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Delete question?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-[#6B6A63]">
            Are you sure you want to delete{" "}
            <span className="font-medium text-[#1A1B23]">&quot;{deleteTarget.text.slice(0, 60)}{deleteTarget.text.length > 60 ? "…" : ""}&quot;</span>?
            This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-medium text-[#6B6A63] hover:bg-[#F4F3EE]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
            >
              {saving ? "Deleting…" : "Delete question"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
