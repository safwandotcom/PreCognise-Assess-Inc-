"use client";

import { useEffect, useRef, useState } from "react";
import type { Branding } from "@/lib/use-branding";

interface TimerRingProps {
  timeLimit: number; // seconds
  onExpire: () => void;
  // When true, freezes the countdown in place (no tick, no expiry check).
  // Resuming continues from the frozen value rather than resetting. Used to
  // stop the clock while a blocking overlay (e.g. multi-display detection)
  // is covering the question — optional so existing callers are unaffected.
  paused?: boolean;
  branding: Branding;
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerRing({ timeLimit, onExpire, paused, branding }: TimerRingProps) {
  // No reset effect needed — the parent mounts a fresh TimerRing per
  // question (key={question.id}), so this initializer runs again on its own.
  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused) return;
    if (secondsLeft <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
      return;
    }
    const tick = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(tick);
  }, [secondsLeft, onExpire, paused]);

  const fraction = timeLimit > 0 ? secondsLeft / timeLimit : 0;
  const color =
    fraction > 0.5 ? branding.primaryColour : fraction > 0.25 ? "#eab308" : "#ef4444";
  const offset = CIRCUMFERENCE * (1 - fraction);

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-[#0F172A]">{secondsLeft}</span>
      </div>
    </div>
  );
}
