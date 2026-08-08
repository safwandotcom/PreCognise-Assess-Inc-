"use client";

import { useState } from "react";
import Image from "next/image";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface McqCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number) => void;
}

const LETTERS = ["A", "B", "C", "D"];

export default function McqCard({ question, branding, onAnswer }: McqCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    onAnswer(index);
  }

  return (
    <div className="w-full max-w-2xl">
      {question.imageUrl && (
        <div className="relative mb-6 h-64 w-full overflow-hidden rounded-lg bg-[#F1F5F9]">
          <Image
            src={question.imageUrl}
            alt="Question"
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-contain"
          />
        </div>
      )}
      <p className="mb-6 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <div className="grid grid-cols-2 gap-4">
        {question.options.map((option, index) => {
          const isSelected = selected === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={selected !== null}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                isSelected ? "" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isSelected ? "text-white" : "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                }`}
                style={isSelected ? { backgroundColor: branding.primaryColour } : undefined}
              >
                {LETTERS[index]}
              </span>
              <span className="text-[#0F172A]">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
