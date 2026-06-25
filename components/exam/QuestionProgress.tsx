"use client";

interface QuestionProgressProps {
  answered: number;   // questions already submitted (not counting current)
  total: number;
  currentIndex: number; // 0-based orderIndex of the current question
}

export default function QuestionProgress({ answered, total, currentIndex }: QuestionProgressProps) {
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
        <span className="text-2xl font-extrabold text-white tabular-nums leading-none">
          {answered + 1}
        </span>
        <span className="text-sm font-medium text-gray-400">
          of {total}
        </span>
        <span className="ml-auto text-xs font-medium text-gray-500">
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
                className={[
                  "flex-1 h-full rounded-full transition-all duration-500",
                  isDone
                    ? "bg-[#6366F1]"
                    : isCurrent
                    ? "bg-white ring-1 ring-white/60 animate-pulse"
                    : "bg-white/10",
                ].join(" ")}
              />
            );
          })}
        </div>
      ) : (
        /* Smooth progress bar for large sets */
        <div className="relative h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-[#6366F1] transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
          {/* Glint overlay */}
          <div
            className="absolute left-0 top-0 h-full w-8 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-all duration-500 ease-out"
            style={{ left: `calc(${pct}% - 16px)` }}
          />
        </div>
      )}
    </div>
  );
}
