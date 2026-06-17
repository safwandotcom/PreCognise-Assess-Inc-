"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth-store";

interface ScoreResponse {
  totalScore: number;
  questionsAnswered: number;
  questionsCorrect: number;
  speedBonusTotal: number;
  maxPossibleScore: number;
}

export default function ResultPage() {
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScore() {
      try {
        const res = await fetch("/api/assessment/score", {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("Failed to load score");
        const data: ScoreResponse = await res.json();
        setScore(data);
      } catch (err) {
        console.error(err);
        setError("Couldn't load your result. Please refresh.");
      }
    }
    loadScore();
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!score) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <p className="text-gray-400">Calculating your score...</p>
      </main>
    );
  }

  const percentage =
    score.maxPossibleScore > 0
      ? Math.round((score.totalScore / score.maxPossibleScore) * 100)
      : 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gray-900 px-4 text-center">
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">PreCognise Assess</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Assessment complete</h1>
      </div>

      <div
        className="relative flex h-48 w-48 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#3b82f6 ${percentage * 3.6}deg, #1f2937 ${percentage * 3.6}deg)`,
        }}
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-gray-900">
          <span className="text-4xl font-bold text-white">{score.totalScore}</span>
          <span className="text-xs text-gray-500">/ {score.maxPossibleScore} pts</span>
        </div>
      </div>

      <div className="flex gap-8 text-sm text-gray-400">
        <div>
          <p className="text-xl font-semibold text-white">{score.questionsCorrect}</p>
          <p>Correct</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-white">{score.speedBonusTotal}</p>
          <p>Speed bonus</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-white">{score.questionsAnswered}</p>
          <p>Answered</p>
        </div>
      </div>
    </main>
  );
}