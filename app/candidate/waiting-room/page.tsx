// app/candidate/waiting-room/page.tsx
"use client";

import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket-client";
import { SocketEvents } from "@/types";
import { useBranding } from "@/lib/use-branding";
import BroadcastToast from "@/components/exam/BroadcastToast";

const COUNTDOWN_START = 60;

function subscribeNoop() {
  return () => {};
}
function getCandidateName() {
  return sessionStorage.getItem("candidateName") ?? "Candidate";
}
function getCandidateNameServer() {
  return "Candidate";
}

export default function WaitingRoomPage() {
  const router = useRouter();
  const branding = useBranding();
  const name = useSyncExternalStore(subscribeNoop, getCandidateName, getCandidateNameServer);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START);
  const [joinedCount, setJoinedCount] = useState(12);
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);

  const clearBroadcast = useCallback(() => setBroadcastMsg(null), []);

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
    const socket = getSocket();
    socket.emit(SocketEvents.CANDIDATE_JOIN);

    socket.on(SocketEvents.SESSION_START, () => {
      router.replace("/candidate/exam");
    });

    socket.on("broadcast", ({ message }: { message: string }) => {
      setBroadcastMsg(message);
    });

    return () => {
      socket.off(SocketEvents.SESSION_START);
      socket.off("broadcast");
    };
  }, [router]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdownDisplay = minutes > 0
    ? `${minutes}:${String(secs).padStart(2, "0")}`
    : `${secs}s`;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4">
      <BroadcastToast message={broadcastMsg} onDismiss={clearBroadcast} />

      <div className="w-full max-w-sm">
        {/* Org badge */}
        <div className="mb-6 flex flex-col items-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl mb-3"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
          >
            <span className="text-xl font-bold text-white">
              {branding.orgName.charAt(0)}
            </span>
          </div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#64748B]">
            {branding.orgName}
          </p>
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[#0F172A]">
            Welcome, {name}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Your session will begin shortly. Please stay on this page.
          </p>

          {/* Countdown */}
          <div className="my-8 flex flex-col items-center">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full border-4 text-3xl font-bold"
              style={{
                borderColor: branding.primaryColour,
                color: branding.primaryColour,
              }}
            >
              {countdownDisplay}
            </div>
            <p className="mt-2 text-xs text-[#94A3B8]">Estimated wait</p>
          </div>

          {/* Joined count */}
          <div className="flex items-center justify-center gap-1.5">
            <div className="flex -space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-5 w-5 rounded-full border-2 border-white bg-[#E2E8F0]"
                />
              ))}
            </div>
            <p className="text-xs text-[#64748B]">
              {joinedCount} candidates in the waiting room
            </p>
          </div>
        </div>

        {/* Test button */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.replace("/candidate/exam")}
            className="text-xs text-[#94A3B8] underline-offset-2 hover:text-[#64748B] hover:underline"
          >
            Continue to exam (test only)
          </button>
        </div>
      </div>
    </div>
  );
}
