"use client";

import type { Branding } from "@/lib/use-branding";

interface QuestionProgressProps {
  answered: number;   // questions already submitted (not counting current)
  total: number;
  currentIndex: number; // 0-based orderIndex of the current question
  branding: Branding;
}

export default function QuestionProgress({ answered, total, currentIndex, branding }: QuestionProgressProps) {
  if (total === 0) return null;

  const remaining = total - answered - 1; // after current
  const pct = Math.round(((answered + 1) / total) * 100);

  // For ≤ 20 questions: show individual pill segments
  // For > 20: show a slim progress bar with the same label
  const useSegments = total <= 20;

  return (
    <div className="flex flex-col gap-2 min-w-0 flex-1">
      {/* Label row */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-[#0F172A] tabular-nums leading-none">
          {answered + 1}
        </span>
        <span className="text-sm font-medium text-[#64748B]">
          of {total}
        </span>
        <span className="ml-auto text-xs font-medium text-[#94A3B8]">
          {remaining > 0
            ? `${remaining} left`
            : "last question"}
        </span>
      </div>

      {useSegments ? (
        /* Segmented pill track */
        <div className="flex gap-[3px] items-center h-2">
          {Array.from({ length: total }).map((_, i) => {
            const isDone = i < answered;
            const isCurrent = i === currentIndex;
            return (
              <div
                key={i}
                className={`flex-1 h-full rounded-full transition-all duration-500 ${
                  isDone ? "" : isCurrent ? "animate-pulse" : "bg-[#E2E8F0]"
                }`}
                style={
                  isDone
                    ? { backgroundColor: branding.primaryColour }
                    : isCurrent
                    ? { backgroundColor: `${branding.primaryColour}66`, boxShadow: `0 0 0 1px ${branding.primaryColour}99` }
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        /* Smooth progress bar for large sets */
        <div className="relative h-2 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: branding.primaryColour }}
          />
          {/* Glint overlay */}
          <div
            className="absolute left-0 top-0 h-full w-8 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-all duration-500 ease-out"
            style={{ left: `calc(${pct}% - 16px)` }}
          />
        </div>
      )}
    </div>
  );
}
