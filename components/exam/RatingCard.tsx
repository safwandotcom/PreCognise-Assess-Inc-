"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";

interface RatingCardProps {
  question: PublicQuestion;
  onAnswer: (value: number) => void;
}

// index 0 -> button "1" (reddest) ... index 9 -> button "10" (greenest)
const COLORS = [
  "bg-red-600",
  "bg-red-500",
  "bg-orange-500",
  "bg-orange-400",
  "bg-yellow-500",
  "bg-yellow-400",
  "bg-lime-500",
  "bg-lime-400",
  "bg-green-500",
  "bg-green-600",
];

export default function RatingCard({ question, onAnswer }: RatingCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(value: number) {
    if (selected !== null) return;
    setSelected(value);
    onAnswer(value);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-8 text-xl font-medium text-white">{question.text}</p>
      <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
        {COLORS.map((color, i) => {
          const value = i + 1;
          const isSelected = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSelect(value)}
              disabled={selected !== null}
              className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white transition-all ${color} ${
                isSelected ? "scale-110 ring-4 ring-white" : ""
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}