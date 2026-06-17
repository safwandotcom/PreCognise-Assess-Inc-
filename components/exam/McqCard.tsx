"use client";

import { useState } from "react";
import Image from "next/image";
import { PublicQuestion } from "@/types";

interface McqCardProps {
  question: PublicQuestion;
  onAnswer: (value: number) => void;
}

const LETTERS = ["A", "B", "C", "D"];

export default function McqCard({ question, onAnswer }: McqCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    onAnswer(index);
  }

  return (
    <div className="w-full max-w-2xl">
      {question.imageUrl && (
        <div className="relative mb-6 h-64 w-full overflow-hidden rounded-lg bg-gray-800">
          <Image
            src={question.imageUrl}
            alt="Question"
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-contain"
          />
        </div>
      )}
      <p className="mb-6 text-xl font-medium text-white">{question.text}</p>
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
                isSelected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-700 bg-gray-800 hover:border-gray-500"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isSelected ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300"
                }`}
              >
                {LETTERS[index]}
              </span>
              <span className="text-gray-100">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}