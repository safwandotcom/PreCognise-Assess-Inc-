// app/candidate/exam/page.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getToken } from "@/lib/auth-store";
import { getSocket, disconnectSocket } from "@/lib/socket-client";
import { SocketEvents, QuestionType, type PublicQuestion } from "@/types";
import { SETTINGS_DEFAULTS, type AssessmentSettings } from "@/lib/get-settings";
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";
import TabSwitchModal from "@/components/exam/TabSwitchModal";
import BroadcastToast from "@/components/exam/BroadcastToast";

const SCREENSHOT_TRIGGER_KEYS = new Set(["PrintScreen", "F13"]);
const MAC_SCREENSHOT_SHIFT_KEYS = new Set(["3", "4", "5", "s", "S"]);

export default function ExamPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  // Grace period timeout handle — cleared when a real answer comes in
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Settings loaded async; event handlers read from this ref without re-binding
  const settingsRef = useRef<AssessmentSettings>(SETTINGS_DEFAULTS);
  // Set to true once campaign config has loaded — triggers fullscreen request
  const configLoadedRef = useRef(false);

  const clearBroadcast = useCallback(() => setBroadcastMsg(null), []);

  // Auto-dismiss screenshot overlay after 800 ms
  useEffect(() => {
    if (!screenshotFlash) return;
    const t = setTimeout(() => setScreenshotFlash(false), 800);
    return () => clearTimeout(t);
  }, [screenshotFlash]);

  const submitAnswer = useCallback(async (value: number | null) => {
    if (!question) return;
    const responseTimeMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
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

    if (res.status === 403) {
      let reason = "disqualified";
      try {
        const data = await res.json();
        if (data.error === "geo_restricted") {
          reason = "This assessment is not available in your region.";
        } else {
          reason = data.error ?? reason;
        }
      } catch {}
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
      return;
    }

    const data = await res.json();
    if (!mountedRef.current) return;

    if (data.done) {
      disconnectSocket();
      router.push("/candidate/result");
      return;
    }
    setQuestion(data.question as PublicQuestion);
    startTimeRef.current = Date.now();
    setLoading(false);
  }, [router]);

  // Double-answer prevention — submittingRef blocks concurrent calls.
  // Grace timer is also cancelled so a pending null-submit doesn't bleed into
  // the next question after a real answer arrives.
  const handleAnswer = useCallback(async (value: number | null) => {
    if (submittingRef.current) return;
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    submittingRef.current = true;
    try {
      await submitAnswer(value);
      await fetchNext();
    } finally {
      submittingRef.current = false;
    }
  }, [submitAnswer, fetchNext]);

  // Timer expired: honour grace period before treating as a skip
  const handleTimerExpire = useCallback(() => {
    const grace = settingsRef.current.gracePeriodSec;
    if (grace > 0) {
      graceTimerRef.current = setTimeout(() => {
        graceTimerRef.current = null;
        handleAnswer(null);
      }, grace * 1000);
    } else {
      handleAnswer(null);
    }
  }, [handleAnswer]);

  // Initial load — settings and first question in parallel
  useEffect(() => {
    mountedRef.current = true;
    fetch("/api/candidate/campaign-config", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        settingsRef.current = { ...SETTINGS_DEFAULTS, ...data };
        configLoadedRef.current = true;
        if (settingsRef.current.antiCheatFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNext();
    return () => {
      mountedRef.current = false;
      if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
    };
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
    socket.on("broadcast", ({ message }: { message: string }) => setBroadcastMsg(message));
    return () => {
      socket.off(SocketEvents.WARNING);
      socket.off(SocketEvents.DISQUALIFIED);
      socket.off("broadcast");
    };
  }, [router]);

  // Poll DB-backed broadcasts every 20 s (reliable path that works even without sockets)
  useEffect(() => {
    let lastSentAt: string | null = null;
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch("/api/candidate/broadcast", {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.message && data.sentAt && data.sentAt !== lastSentAt) {
          lastSentAt = data.sentAt;
          setBroadcastMsg(data.message);
        }
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 20_000);
    return () => { active = false; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Anti-cheat ─────────────────────────────────────────────────────────────
  // All guards run from mount. Event handlers read settingsRef.current at call
  // time so they respect the latest settings without needing to be re-bound.
  useEffect(() => {
    const socket = getSocket();

    const handleTabSwitch = async () => {
      if (!settingsRef.current.antiCheatTabSwitch) return;
      try {
        const res = await fetch("/api/candidate/tab-switch", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.disqualified) {
          sessionStorage.setItem(
            "disqualifyReason",
            data.disqualifyReason ?? `Disqualified: exceeded tab switch limit.`
          );
          disconnectSocket();
          router.push("/candidate/disqualified");
          return;
        }
      } catch {
        // network error — still emit socket event so admin can see it
      }
      socket.emit(SocketEvents.TAB_SWITCH);
    };

    const onVisibilityChange = () => {
      if (!settingsRef.current.antiCheatTabSwitch) return;
      if (document.visibilityState === "hidden") handleTabSwitch();
    };
    const onBlur = () => {
      handleTabSwitch();
    };
    const onBeforeUnload = () => socket.emit(SocketEvents.PAGE_REFRESH);
    const onContextMenu = (e: MouseEvent) => {
      if (settingsRef.current.antiCheatContextMenu) e.preventDefault();
    };
    const onSelectStart = (e: Event) => {
      if (settingsRef.current.antiCheatCopyPaste) e.preventDefault();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (settingsRef.current.antiCheatCopyPaste) e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (settingsRef.current.antiCheatCopyPaste) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const s = settingsRef.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Screenshot keys
      if (s.antiCheatScreenshot) {
        if (SCREENSHOT_TRIGGER_KEYS.has(e.key)) {
          e.preventDefault();
          setScreenshotFlash(true);
          return;
        }
        if (e.metaKey && shift && MAC_SCREENSHOT_SHIFT_KEYS.has(e.key)) {
          e.preventDefault();
          setScreenshotFlash(true);
          return;
        }
      }
      // Dev tools
      if (s.antiCheatDevTools) {
        if (e.key === "F12") { e.preventDefault(); return; }
        if (ctrl && shift && ["i", "I", "j", "J", "c", "C"].includes(e.key)) { e.preventDefault(); return; }
        if (ctrl && (e.key === "u" || e.key === "U")) { e.preventDefault(); return; }
      }
      // Selection & clipboard
      if (s.antiCheatCopyPaste) {
        if (ctrl && (e.key === "a" || e.key === "A")) { e.preventDefault(); return; }
        if (ctrl && ["c", "C", "x", "X"].includes(e.key)) { e.preventDefault(); return; }
      }
      // Print
      if (ctrl && (e.key === "p" || e.key === "P")) { e.preventDefault(); }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && settingsRef.current.antiCheatFullscreen) {
        setFullscreenWarning(true);
        handleTabSwitch();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [router]);

  // ── Render ─────────────────────────────────────────────────────────────────

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
      {screenshotFlash && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 bg-black/95">
          <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-base font-semibold text-white">Screenshots are not permitted</p>
          <p className="text-sm text-gray-400">This attempt has been recorded.</p>
        </div>
      )}

      {fullscreenWarning && (
        <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-4 bg-black/90">
          <svg className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          <p className="text-lg font-semibold text-white">You exited fullscreen</p>
          <p className="text-sm text-gray-400">This assessment requires fullscreen mode.</p>
          <button
            type="button"
            onClick={() => {
              document.documentElement.requestFullscreen().catch(() => {});
              setFullscreenWarning(false);
            }}
            className="mt-2 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5]"
          >
            Return to fullscreen
          </button>
        </div>
      )}

      {showWarning && <TabSwitchModal onClose={() => setShowWarning(false)} />}
      <BroadcastToast message={broadcastMsg} onDismiss={clearBroadcast} />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400 text-sm">Question {question.orderIndex + 1}</span>
          <TimerRing timeLimit={question.timeLimitSec} onExpire={handleTimerExpire} />
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
