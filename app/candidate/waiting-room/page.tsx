// app/candidate/waiting-room/page.tsx
"use client";

import { useEffect, useState, useSyncExternalStore, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket-client";
import { getToken } from "@/lib/auth-store";
import { SocketEvents } from "@/types";
import { useBranding } from "@/lib/use-branding";
import BroadcastToast from "@/components/exam/BroadcastToast";

const COUNTDOWN_START = 60;

function subscribeNoop() { return () => {}; }
function getCandidateName() { return sessionStorage.getItem("candidateName") ?? "Candidate"; }
function getCandidateNameServer() { return "Candidate"; }

export default function WaitingRoomPage() {
  const router = useRouter();
  const branding = useBranding();
  const name = useSyncExternalStore(subscribeNoop, getCandidateName, getCandidateNameServer);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START);
  const [stats, setStats] = useState<{
    inWaitingRoom: number;
    joined: number;
    total: number;
    sessionTitle: string | null;
    sessionStatus: string | null;
  } | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  // true when polling (or socket) confirms the session is LIVE
  const [readyToStart, setReadyToStart] = useState(false);
  // prevent double-navigation
  const navigatingRef = useRef(false);

  const clearBroadcast = useCallback(() => setBroadcastMsg(null), []);

  const goToExam = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.replace("/candidate/exam");
  }, [router]);

  const fetchStats = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/candidate/session-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        if (data.sessionStatus === "LIVE") {
          setReadyToStart(true);
        }
      }
    } catch {
      // non-fatal
    }
  }, []);

  // Countdown — stops at 0
  useEffect(() => {
    if (readyToStart) return; // no need to count down once session is live
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [readyToStart]);

  // Poll every 10 s — Redis cache means this is ~4 DB hits/10 s across all 15k candidates
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Socket: admin fires session:start → redirect immediately (fast path)
  useEffect(() => {
    const socket = getSocket();
    socket.emit(SocketEvents.CANDIDATE_JOIN);

    socket.on(SocketEvents.SESSION_START, () => {
      goToExam();
    });

    socket.on("broadcast", ({ message }: { message: string }) => {
      setBroadcastMsg(message);
    });

    return () => {
      socket.off(SocketEvents.SESSION_START);
      socket.off("broadcast");
    };
  }, [goToExam]);

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
            {readyToStart
              ? "Your assessment is ready. Click below to begin."
              : "Your session will begin shortly. Please stay on this page."}
          </p>

          <div className="my-8 flex flex-col items-center">
            {readyToStart ? (
              /* ── SESSION IS LIVE ── */
              <>
                <div
                  className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" }}
                >
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <button
                  onClick={goToExam}
                  className="w-full rounded-xl py-3.5 text-base font-semibold text-white shadow-md transition hover:opacity-90 active:scale-[0.98]"
                  style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
                >
                  Start Assessment Now
                </button>
                <p className="mt-3 text-xs text-[#94A3B8]">Click when you're ready — you can begin at any time.</p>
              </>
            ) : secondsLeft > 0 ? (
              /* ── COUNTING DOWN ── */
              <>
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full border-4 text-3xl font-bold"
                  style={{ borderColor: branding.primaryColour, color: branding.primaryColour }}
                >
                  {countdownDisplay}
                </div>
                <p className="mt-2 text-xs text-[#94A3B8]">Estimated wait</p>
              </>
            ) : (
              /* ── COUNTDOWN EXPIRED, SESSION NOT LIVE YET ── */
              <>
                <div className="mb-3 flex h-10 w-10 items-center justify-center">
                  <div
                    className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#E2E8F0]"
                    style={{ borderTopColor: branding.primaryColour }}
                  />
                </div>
                <p className="text-sm font-medium text-[#0F172A]">Waiting for your session to begin…</p>
                <p className="mt-1 text-xs text-[#94A3B8]">Your session hasn't started yet. Please stay on this page.</p>
              </>
            )}
          </div>

          {/* Candidate count */}
          {stats && (
            <div className="space-y-2 border-t border-[#E2E8F0] pt-4">
              <div className="flex items-center justify-center gap-1.5">
                <div className="flex -space-x-1">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-5 w-5 rounded-full border-2 border-white bg-[#E2E8F0]" />
                  ))}
                </div>
                <p className="text-xs text-[#64748B]">
                  <span className="font-semibold text-[#0F172A]">{stats.inWaitingRoom}</span>
                  {" of "}
                  <span className="font-semibold text-[#0F172A]">{stats.total}</span>
                  {" candidates in the waiting room"}
                </p>
              </div>
              {stats.joined > stats.inWaitingRoom && (
                <p className="text-center text-[10px] text-[#94A3B8]">
                  {stats.joined - stats.inWaitingRoom} already in the exam
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
