// app/candidate/exam/page.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getToken } from "@/lib/auth-store";
import { getSocket, disconnectSocket } from "@/lib/socket-client";
import { SocketEvents, QuestionType, type PublicQuestion } from "@/types";
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";
import TabSwitchModal from "@/components/exam/TabSwitchModal";
import BroadcastToast from "@/components/exam/BroadcastToast";

export default function ExamPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearBroadcast = useCallback(() => setBroadcastMsg(null), []);

  const submitAnswer = useCallback(async (value: number | null) => {
    if (!question) return;
    const responseTimeMs = startTimeRef.current
      ? Date.now() - startTimeRef.current
      : 0;
    await fetch("/api/assessment/submit-answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ questionId: question.id, value, responseTimeMs }),
    });
  }, [question]);

  const fetchNext = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    const res = await fetch("/api/assessment/next-question", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!mountedRef.current) return;

    // Server-side disqualification gate (added alongside the API patch) —
    // this is the Back-button case: the socket-side redirect already fired
    // once, but if this route is somehow hit again, don't try to render an
    // undefined question, just send them to the disqualified screen.
    if (res.status === 403) {
      disconnectSocket();
      router.push("/candidate/disqualified");
      return;
    }

    if (data.done) {
      disconnectSocket();
      router.push("/candidate/result");
      return;
    }
    setQuestion(data.question as PublicQuestion);
    startTimeRef.current = Date.now();
    setLoading(false);
  }, [router]);

  const handleAnswer = useCallback(async (value: number | null) => {
    await submitAnswer(value);
    await fetchNext();
  }, [submitAnswer, fetchNext]);

  // Initial question load
  useEffect(() => {
    mountedRef.current = true;
    fetchNext();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket events
  useEffect(() => {
    const socket = getSocket();
    socket.emit(SocketEvents.CANDIDATE_JOIN);
    socket.on(SocketEvents.WARNING, () => setShowWarning(true));
    socket.on(SocketEvents.DISQUALIFIED, ({ reason }: { reason: string }) => {
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
    });
    socket.on("broadcast", ({ message }: { message: string }) => {
      setBroadcastMsg(message);
    });

    return () => {
      socket.off(SocketEvents.WARNING);
      socket.off(SocketEvents.DISQUALIFIED);
      socket.off("broadcast");
    };
  }, [router]);

  // Anti-cheat listeners
  useEffect(() => {
    const socket = getSocket();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") socket.emit(SocketEvents.TAB_SWITCH);
    };
    const onBlur = () => socket.emit(SocketEvents.TAB_SWITCH);
    const onBeforeUnload = () => socket.emit(SocketEvents.PAGE_REFRESH);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading question...</div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white select-none">
      {showWarning && <TabSwitchModal onClose={() => setShowWarning(false)} />}
      <BroadcastToast message={broadcastMsg} onDismiss={clearBroadcast} />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400 text-sm">
            Question {question.orderIndex + 1}
          </span>
          <TimerRing
            timeLimit={question.timeLimitSec}
            onExpire={() => handleAnswer(null)}
          />
        </div>

        <h2 className="text-white text-xl font-semibold mb-6">{question.text}</h2>

        {question.imageUrl && (
          <Image
            src={question.imageUrl}
            alt="Question"
            width={600}
            height={256}
            className="rounded-xl mb-6 object-contain max-h-64"
          />
        )}

        {(question.type === QuestionType.MCQ || question.type === QuestionType.IMAGE) && (
          <McqCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.PSYCHOMETRIC && (
          <PsychometricCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.RATING && (
          <RatingCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
      </div>
    </div>
  );
}