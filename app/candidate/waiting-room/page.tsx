"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const COUNTDOWN_START = 60;

function subscribeNoop() {
  return () => {};
}
function getCandidateName() {
  return sessionStorage.getItem("candidateName") ?? "Candidate";
}
function getCandidateNameServer() {
  return "Candidate"; // sessionStorage doesn't exist during SSR
}

export default function WaitingRoomPage() {
  const router = useRouter();
  const name = useSyncExternalStore(subscribeNoop, getCandidateName, getCandidateNameServer);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START);
  const [joinedCount, setJoinedCount] = useState(12);

  // Cosmetic only — real navigation is triggered by session:start (Phase 4).
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setJoinedCount((c) => c + Math.floor(Math.random() * 2));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // TODO (Phase 4): connect socket, emit candidate:join, listen for
    // "session:start" -> router.replace("/candidate/exam")
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-900 px-4 text-center">
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">PreCognise Assess</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Welcome, {name}</h1>
        <p className="mt-1 text-gray-400">Hang tight — the session will begin shortly.</p>
      </div>

      <div className="text-6xl font-bold text-blue-500">{secondsLeft}s</div>

      <p className="text-sm text-gray-500">{joinedCount} candidates have joined the waiting room</p>

      <button
        type="button"
        onClick={() => router.replace("/candidate/exam")}
        className="mt-6 rounded-lg border border-gray-700 px-4 py-2 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300"
      >
        Continue to exam (test only)
      </button>
    </main>
  );
}