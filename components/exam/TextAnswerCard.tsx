"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface TextAnswerCardProps {
  question: PublicQuestion;
  variant: "short" | "long";
  branding: Branding;
  onAnswer: (value: string) => void;
}

// Fallback limits only used if a question somehow has no wordLimit set
// (shouldn't happen for short_answer/long_answer created via the admin UI,
// which always requires one — this just avoids an unbounded textarea).
const FALLBACK_LIMIT: Record<TextAnswerCardProps["variant"], number> = {
  short: 50,
  long: 500,
};

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

// Truncates `text` to at most `limit` words. Splits on whitespace runs so
// trailing spaces the candidate is still typing are preserved rather than
// eaten mid-keystroke.
function truncateToWordLimit(text: string, limit: number): string {
  const tokens = text.split(/(\s+)/);
  let wordCount = 0;
  let result = "";
  for (const token of tokens) {
    if (token.trim() === "") {
      result += token;
      continue;
    }
    if (wordCount >= limit) break;
    wordCount += 1;
    result += token;
  }
  return result;
}

export default function TextAnswerCard({ question, variant, onAnswer }: TextAnswerCardProps) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const limit = question.wordLimit ?? FALLBACK_LIMIT[variant];
  const wordCount = countWords(text);
  const atLimit = wordCount >= limit;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setText(countWords(next) > limit ? truncateToWordLimit(next, limit) : next);
  }

  function handleSubmit() {
    if (submitted || text.trim() === "") return;
    setSubmitted(true);
    onAnswer(text.trim());
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-6 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <textarea
        rows={variant === "short" ? 3 : 10}
        value={text}
        onChange={handleChange}
        disabled={submitted}
        placeholder={variant === "short" ? "Type your short answer…" : "Type your long answer…"}
        className="w-full rounded-xl border border-[#E2E8F0] bg-white p-4 text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs font-medium ${atLimit ? "text-amber-600" : "text-[#64748B]"}`}>
          {wordCount} / {limit} words
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitted || text.trim() === ""}
          className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-40"
        >
          {submitted ? "Submitted" : "Submit answer"}
        </button>
      </div>
    </div>
  );
}
