"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface PsychometricCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number) => void;
}

const MOODS = [
  { emoji: "😢", value: 1, label: "Very unhappy" },
  { emoji: "😕", value: 2, label: "Unhappy" },
  { emoji: "😐", value: 3, label: "Neutral" },
  { emoji: "🙂", value: 4, label: "Happy" },
  { emoji: "😄", value: 5, label: "Very happy" },
];

export default function PsychometricCard({ question, branding, onAnswer }: PsychometricCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(value: number) {
    if (selected !== null) return;
    setSelected(value);
    onAnswer(value);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-8 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <div className="flex items-center justify-between gap-2">
        {MOODS.map((mood) => {
          const isSelected = selected === mood.value;
          return (
            <button
              key={mood.value}
              type="button"
              onClick={() => handleSelect(mood.value)}
              disabled={selected !== null}
              className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                isSelected ? "scale-110" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span className="text-4xl">{mood.emoji}</span>
              <span className="text-xs text-[#64748B]">{mood.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
