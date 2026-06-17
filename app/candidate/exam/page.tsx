"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-store";
import { PublicQuestion, QuestionType } from "@/types";
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";

interface NextQuestionResponse {
  done: boolean;
  question?: PublicQuestion;
}

export default function ExamPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  async function loadNextQuestion() {
    setError(null);
    try {
      const res = await fetch("/api/assessment/next-question", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.status === 401) {
        router.replace("/candidate/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load question");

      const data: NextQuestionResponse = await res.json();

      if (data.done || !data.question) {
        router.replace("/candidate/result");
        return;
      }

      setQuestion(data.question);
      startTimeRef.current = Date.now();
    } catch (err) {
      console.error(err);
      setError("Couldn't load the next question. Retrying...");
      setTimeout(loadNextQuestion, 2000);
    }
  }

  useEffect(() => {
    loadNextQuestion();
    // TODO (Phase 4): connect the socket here and listen for "disqualified" ->
    // sessionStorage.setItem("disqualifyReason", reason); router.replace("/candidate/disqualified")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAnswer(value: number | null) {
    if (!question) return;
    const responseTimeMs = Date.now() - startTimeRef.current;

    try {
      await fetch("/api/assessment/submit-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ questionId: question.id, value, responseTimeMs }),
      });
    } catch (err) {
      console.error("Submit failed, moving on anyway:", err);
    }

    loadNextQuestion();
  }

  function renderCard(q: PublicQuestion) {
    switch (q.type) {
      case QuestionType.PSYCHOMETRIC:
        return <PsychometricCard question={q} onAnswer={handleAnswer} />;
      case QuestionType.RATING:
        return <RatingCard question={q} onAnswer={handleAnswer} />;
      default:
        return <McqCard question={q} onAnswer={handleAnswer} />; // mcq + image
    }
  }

  return (
    <main
      onContextMenu={(e) => e.preventDefault()}
      className="flex min-h-screen select-none flex-col items-center justify-center gap-10 bg-gray-900 px-4 py-12"
    >
      {!question && !error && <p className="text-gray-400">Loading question...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {question && (
        <>
          <TimerRing
            key={question.id}
            timeLimit={question.timeLimitSec}
            onExpire={() => handleAnswer(null)}
          />
          {renderCard(question)}
        </>
      )}
    </main>
  );
}