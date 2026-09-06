// app/candidate/exam/page.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-store";
import { getSocket, disconnectSocket } from "@/lib/socket-client";
import { SocketEvents, QuestionType, type PublicQuestion } from "@/types";
import { SETTINGS_DEFAULTS, type AssessmentSettings } from "@/lib/get-settings";
import { useBranding } from "@/lib/use-branding";
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";
import TextAnswerCard from "@/components/exam/TextAnswerCard";
import MultiSelectCard from "@/components/exam/MultiSelectCard";
import TabSwitchModal from "@/components/exam/TabSwitchModal";
import BroadcastToast from "@/components/exam/BroadcastToast";
import QuestionProgress from "@/components/exam/QuestionProgress";
import CameraSelfView from "@/components/exam/CameraSelfView";

const SCREENSHOT_TRIGGER_KEYS = new Set(["PrintScreen", "F13"]);
const MAC_SCREENSHOT_SHIFT_KEYS = new Set(["3", "4", "5", "s", "S"]);

export default function ExamPage() {
  const router = useRouter();
  const branding = useBranding();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [tabSwitchInfo, setTabSwitchInfo] = useState({ count: 0, limit: 0 });
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
  const [cameraRequired, setCameraRequired] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraWarning, setCameraWarning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraAttempts, setCameraAttempts] = useState({ count: 0, limit: 3 });
  const [multiDisplayWarning, setMultiDisplayWarning] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  // Grace period timeout handle — cleared when a real answer comes in
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Settings loaded async; event handlers read from this ref without re-binding
  const settingsRef = useRef<AssessmentSettings>(SETTINGS_DEFAULTS);
  // Set to true once campaign config has loaded — triggers fullscreen request
  const configLoadedRef = useRef(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const multiDisplayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latches once a track-drop violation has been reported for the current
  // grant, so onended (which side-effects via fetch/router — kept out of any
  // setState updater, which React may invoke more than once) reports once.
  const cameraDropReportedRef = useRef(false);
  // Latches once the current multi-display occurrence has been reported, so
  // a poll tick that finds isExtended still true doesn't re-report every
  // interval. Reset to false when isExtended goes back to false, so a later
  // reconnect counts as a new occurrence.
  const multiDisplayReportedRef = useRef(false);

  const clearBroadcast = useCallback(() => setBroadcastMsg(null), []);

  // Auto-dismiss screenshot overlay after 800 ms
  useEffect(() => {
    if (!screenshotFlash) return;
    const t = setTimeout(() => setScreenshotFlash(false), 800);
    return () => clearTimeout(t);
  }, [screenshotFlash]);

  const submitAnswer = useCallback(async (value: number | number[] | string | null) => {
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
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {}

      if (data.error === "window_closed") {
        sessionStorage.setItem("completionMessage", "This assessment's scheduled window has closed.");
        sessionStorage.removeItem("totalQuestions");
        disconnectSocket();
        router.push("/candidate/result");
        return;
      }

      let reason = "Your assessment was ended for a policy violation.";
      if (data.error === "geo_restricted") {
        reason = "This assessment is not available in your region.";
      } else if (data.error) {
        reason = data.error;
      }
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
      return;
    }

    const data = await res.json();
    if (!mountedRef.current) return;

    if (data.done) {
      if (data.completionMessage) {
        sessionStorage.setItem("completionMessage", data.completionMessage);
      } else {
        sessionStorage.removeItem("completionMessage");
      }
      if (data.totalQuestions) {
        sessionStorage.setItem("totalQuestions", String(data.totalQuestions));
      }
      disconnectSocket();
      router.push("/candidate/result");
      return;
    }
    setQuestion(data.question as PublicQuestion);
    setProgress({ answered: data.answeredCount ?? 0, total: data.totalQuestions ?? 0 });
    startTimeRef.current = Date.now();
    setLoading(false);
  }, [router]);

  // Double-answer prevention — submittingRef blocks concurrent calls.
  // Grace timer is also cancelled so a pending null-submit doesn't bleed into
  // the next question after a real answer arrives.
  const handleAnswer = useCallback(async (value: number | number[] | string | null) => {
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

  // Shared anti-cheat violation reporter — used by tab-switch/visibility/blur
  // detection, the fullscreen-exit guard, and the camera/mic presence guard.
  // /api/candidate/tab-switch (Postgres-backed) is the sole authority for
  // counting violations and deciding disqualification — it persists to the
  // DB and is unaffected by the candidate's socket reconnecting, which
  // routinely happens when a browser tab is backgrounded (i.e. exactly when
  // a real tab-switch occurs). The socket emit below is a fire-and-forget
  // relay of that already-decided outcome, purely for the admin's live
  // view — it is never itself the thing that decides pass/warn/disqualify.
  const handleTabSwitch = useCallback(async () => {
    if (!settingsRef.current.antiCheatTabSwitch) return;
    const socket = getSocket();
    try {
      const res = await fetch("/api/candidate/tab-switch", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();

      if (settingsRef.current.autoDisqualifyOnViolation) {
        socket.emit(SocketEvents.TAB_SWITCH, {
          count: data.count,
          limit: data.limit,
          disqualified: !!data.disqualified,
        });
      }

      if (data.disqualified) {
        sessionStorage.setItem(
          "disqualifyReason",
          data.disqualifyReason ?? `Disqualified: exceeded tab switch limit.`
        );
        disconnectSocket();
        router.push("/candidate/disqualified");
        return;
      }
      setTabSwitchInfo({ count: data.count, limit: data.limit });
      setShowWarning(true);
    } catch {
      // Network error — the REST call is the only source of truth for
      // counting/disqualifying, so there is nothing reliable to relay or
      // act on. The candidate is not warned or disqualified for this one
      // occurrence; a later successful call reflects the real state.
    }
  }, [router]);

  // Dedicated camera/mic violation reporter — fixed at 3 attempts, independent
  // of the admin-configurable tabSwitchLimit/antiCheatTabSwitch toggle. Active
  // whenever antiCheatCamera is on, regardless of the tab-switch setting.
  const reportCameraViolation = useCallback(async () => {
    try {
      const res = await fetch("/api/candidate/camera-violation", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.disqualified) {
        sessionStorage.setItem(
          "disqualifyReason",
          data.disqualifyReason ?? `Disqualified: camera/microphone access denied.`
        );
        disconnectSocket();
        router.push("/candidate/disqualified");
        return;
      }
      if (typeof data.count === "number" && typeof data.limit === "number") {
        setCameraAttempts({ count: data.count, limit: data.limit });
      }
    } catch {
      // network error — overlay remains visible; candidate can retry
    }
  }, [router]);

  // Request camera/mic access; used both for the initial grant and the
  // "Grant access" retry button after a denial or a dropped track.
  const requestCamera = useCallback(async () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraStreamRef.current = stream;
      cameraDropReportedRef.current = false;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (cameraDropReportedRef.current) return;
          cameraDropReportedRef.current = true;
          setCameraActive(false);
          setCameraWarning(true);
          reportCameraViolation();
        };
      });
      setCameraStream(stream);
      setCameraActive(true);
      setCameraWarning(false);
    } catch {
      setCameraActive(false);
      setCameraWarning(true);
      reportCameraViolation();
    }
  }, [reportCameraViolation]);

  // Multi-display violation reporter — increment-only, no limit, no
  // disqualification. Unlike camera, a candidate can always resolve this
  // themselves by disconnecting the extra display, so this only logs.
  const reportMultiDisplayViolation = useCallback(async () => {
    try {
      const res = await fetch("/api/candidate/multi-display-violation", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      return res.ok;
    } catch {
      // network error — overlay still reflects live isExtended state via polling
      return false;
    }
  }, []);

  // Initial load — settings and first question in parallel
  useEffect(() => {
    mountedRef.current = true;
    fetch("/api/candidate/campaign-config", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!mountedRef.current) return;
        settingsRef.current = { ...SETTINGS_DEFAULTS, ...data };
        configLoadedRef.current = true;
        if (settingsRef.current.antiCheatFullscreen) {
          // requestFullscreen() can fail silently here — this runs inside an
          // async fetch().then(), not a direct user-gesture handler, so it
          // frequently lacks the "transient activation" the Fullscreen API
          // requires and rejects with no error surfaced. It can also resolve
          // and then get auto-exited a moment later by the browser itself
          // (Chrome exits fullscreen the instant a permission prompt, e.g.
          // the camera/mic request below, appears — a built-in anti-phishing
          // measure). The existing fullscreenchange listener only fires on a
          // *transition*, so if fullscreen never actually engaged in the
          // first place, no exit event ever fires and nothing catches it.
          // Explicitly verify the real state after the promise settles
          // (success or failure) and surface the same blocking overlay a
          // real exit would, instead of assuming requestFullscreen() worked.
          document.documentElement.requestFullscreen().catch(() => {}).then(() => {
            if (mountedRef.current && !document.fullscreenElement) {
              setFullscreenWarning(true);
            }
          });
        }
        if (settingsRef.current.antiCheatCamera) {
          setCameraRequired(true);
          requestCamera();
        }
        if (
          settingsRef.current.antiCheatMultiDisplay &&
          typeof window.screen.isExtended === "boolean"
        ) {
          const checkMultiDisplay = () => {
            const extended = window.screen.isExtended;
            if (extended) {
              setMultiDisplayWarning(true);
              if (!multiDisplayReportedRef.current) {
                multiDisplayReportedRef.current = true;
                reportMultiDisplayViolation().then((ok) => {
                  if (!ok) multiDisplayReportedRef.current = false;
                });
              }
            } else {
              setMultiDisplayWarning(false);
              multiDisplayReportedRef.current = false;
            }
          };
          checkMultiDisplay();
          multiDisplayIntervalRef.current = setInterval(checkMultiDisplay, 4000);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNext();
    return () => {
      mountedRef.current = false;
      if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (multiDisplayIntervalRef.current !== null) clearInterval(multiDisplayIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket events
  useEffect(() => {
    const socket = getSocket();
    socket.emit(SocketEvents.CANDIDATE_JOIN);
    // The tab-switch warning modal is driven directly by the REST response
    // in handleTabSwitch now, not by a server-pushed "warning" event — see
    // the comment there for why the socket layer is no longer a decision
    // point for tab-switch handling.
    socket.on(SocketEvents.DISQUALIFIED, ({ reason }: { reason: string }) => {
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
    });
    socket.on("broadcast", ({ message }: { message: string }) => setBroadcastMsg(message));
    return () => {
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

    const onVisibilityChange = () => {
      if (!settingsRef.current.antiCheatTabSwitch) return;
      if (document.visibilityState === "hidden") handleTabSwitch();
    };
    const onBlur = () => {
      handleTabSwitch();
    };
    const onBeforeUnload = () => {
      if (settingsRef.current.autoDisqualifyOnViolation) socket.emit(SocketEvents.PAGE_REFRESH);
    };
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
  }, [router, handleTabSwitch]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-[#0F172A] text-xl animate-pulse">Loading question...</div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] select-none">
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
              // Only dismiss the overlay once fullscreen is confirmed active —
              // this click is a genuine user gesture, so requestFullscreen()
              // reliably succeeds here, but the dismissal must stay gated on
              // the actual result rather than assumed, so a rejection (e.g.
              // the request racing another permission prompt) leaves the
              // candidate correctly blocked instead of silently let through.
              document.documentElement.requestFullscreen().then(
                () => setFullscreenWarning(false),
                () => {}
              );
            }}
            className="mt-2 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5]"
          >
            Return to fullscreen
          </button>
        </div>
      )}

      {cameraWarning && (
        <div className="fixed inset-0 z-[9997] flex flex-col items-center justify-center gap-4 bg-black/90">
          <svg className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-lg font-semibold text-white">Camera &amp; microphone access required</p>
          <p className="text-sm text-gray-400">This assessment requires your camera and microphone to stay on for the entire exam.</p>
          <p className="max-w-sm text-center text-xs text-gray-500">
            If your browser isn&apos;t showing a permission prompt, access may already be blocked —
            click the camera icon in your address bar to allow it, then try again.
          </p>
          <p className="text-xs font-semibold text-amber-400">Attempt {Math.min(cameraAttempts.count, cameraAttempts.limit)} of {cameraAttempts.limit}</p>
          <button
            type="button"
            onClick={requestCamera}
            className="mt-2 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5]"
          >
            Grant camera &amp; microphone access
          </button>
        </div>
      )}

      {multiDisplayWarning && (
        <div className="fixed inset-0 z-[9996] flex flex-col items-center justify-center gap-4 bg-black/90">
          <svg className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
          </svg>
          <p className="text-lg font-semibold text-white">Extra display detected</p>
          <p className="text-sm text-gray-400">This assessment requires a single display. Please disconnect any additional monitors to continue.</p>
        </div>
      )}

      {showWarning && (
        <TabSwitchModal
          count={tabSwitchInfo.count}
          limit={tabSwitchInfo.limit}
          onClose={() => setShowWarning(false)}
        />
      )}
      <BroadcastToast message={broadcastMsg} onDismiss={clearBroadcast} />
      {cameraRequired && cameraActive && cameraStream && (
        <CameraSelfView stream={cameraStream} />
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="sticky top-0 z-30 mb-8 flex items-end gap-6 bg-[#F8FAFC] py-3">
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={progress.answered}
              branding={branding}
            />
          )}
          <div className="shrink-0">
            <TimerRing
              key={question.id}
              timeLimit={question.timeLimitSec}
              onExpire={handleTimerExpire}
              paused={multiDisplayWarning}
              branding={branding}
            />
          </div>
        </div>

        {(question.type === QuestionType.MCQ ||
          question.type === QuestionType.IMAGE ||
          question.type === QuestionType.TRUE_FALSE) && (
          <McqCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.MULTI_SELECT && (
          <MultiSelectCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.PSYCHOMETRIC && (
          <PsychometricCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.RATING && (
          <RatingCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.SHORT_ANSWER && (
          <TextAnswerCard question={question} variant="short" branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.LONG_ANSWER && (
          <TextAnswerCard question={question} variant="long" branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
      </div>
    </div>
  );
}
