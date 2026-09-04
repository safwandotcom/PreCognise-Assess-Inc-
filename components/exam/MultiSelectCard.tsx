"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface MultiSelectCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number[]) => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Checkbox-style card for multi-select MCQ — unlike McqCard (click one,
// submit immediately, lock), the candidate can check/uncheck freely and
// must press Submit when ready, mirroring TextAnswerCard's select-then-
// confirm pattern rather than McqCard's click-and-lock one, since there's
// no single click that means "done" here.
export default function MultiSelectCard({ question, branding, onAnswer }: MultiSelectCardProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  function toggle(index: number) {
    if (submitted) return;
    setSelected((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  }

  function handleSubmit() {
    if (submitted || selected.length === 0) return;
    setSubmitted(true);
    onAnswer(selected);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-2 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <p className="mb-6 text-sm font-medium text-[#64748B]">
        Select {question.correctCount ?? "the correct number of"} of {question.options.length} options
      </p>
      <div className="grid grid-cols-2 gap-4">
        {question.options.map((option, index) => {
          const isSelected = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={submitted}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                isSelected ? "" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${submitted && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                  isSelected ? "text-white" : "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                }`}
                style={isSelected ? { backgroundColor: branding.primaryColour } : undefined}
              >
                {isSelected ? "✓" : LETTERS[index]}
              </span>
              <span className="text-[#0F172A]">{option}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted || selected.length === 0}
        className="mt-6 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-40"
      >
        {submitted ? "Submitted" : "Submit answer"}
      </button>
    </div>
  );
}
