"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";

interface PsychometricCardProps {
  question: PublicQuestion;
  onAnswer: (value: number) => void;
}

const MOODS = [
  { emoji: "😢", value: 1, label: "Very unhappy" },
  { emoji: "😕", value: 2, label: "Unhappy" },
  { emoji: "😐", value: 3, label: "Neutral" },
  { emoji: "🙂", value: 4, label: "Happy" },
  { emoji: "😄", value: 5, label: "Very happy" },
];

export default function PsychometricCard({ question, onAnswer }: PsychometricCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(value: number) {
    if (selected !== null) return;
    setSelected(value);
    onAnswer(value);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-8 text-xl font-medium text-white">{question.text}</p>
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
                isSelected
                  ? "scale-110 border-blue-500 bg-blue-500/10"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
            >
              <span className="text-4xl">{mood.emoji}</span>
              <span className="text-xs text-gray-400">{mood.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}