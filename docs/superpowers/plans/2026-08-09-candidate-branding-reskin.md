# Candidate Branding Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The candidate exam-taking page and post-exam result page currently hardcode a dark theme (`bg-gray-900`, `text-white`, `bg-gray-800` cards) completely disconnected from the organization's actual branding. Every other candidate page (login, instructions, waiting-room, forgot-password) is light-themed and branding-aware via `useBranding()`. This plan brings the exam and result pages in line: light theme matching the rest of the candidate journey, with `branding.primaryColour` applied to the same kind of accent elements it's already used for elsewhere (logo/icon squares, the waiting-room countdown ring) — the exam page's timer ring, selected-answer highlight, and progress fill.

**Architecture:** No new branding infrastructure — `useBranding()` (`lib/use-branding.ts`) already exists and is proven across four other candidate pages. This plan wires it into the two pages that bypass it, following the *exact* established convention observed in those four pages: a static light page background (`bg-[#F8FAFC]`) and dark text tokens (`#0F172A`/`#64748B`/`#94A3B8`/`#E2E8F0`) — never a dynamic `branding.bgColor` background, since no existing page does that — plus `branding.primaryColour` reserved for a few prominent accent surfaces, applied via inline `style` (the same mechanism every existing branded page already uses for dynamic color, since Tailwind's arbitrary-value classes can't take a runtime variable). Regular buttons and input focus rings stay the static `#6366F1` used everywhere else in the codebase — no page anywhere makes those dynamic, so this plan doesn't invent that pattern here either. `useBranding()` is called once, at the top of the exam page, and threaded down as a `branding` prop to the four answer-card components plus `QuestionProgress`/`TimerRing` — not re-fetched independently in each child.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS. No new dependency — reuses the existing `useBranding()` hook and `Branding` type.

## Global Constraints

- No unit/integration test framework exists in this app — verification is `npx tsc --noEmit` + `npx eslint`, not automated tests.
- Follow the *exact* precedent set by `app/candidate/login/page.tsx`, `instructions/page.tsx`, `waiting-room/page.tsx`, `forgot-password/page.tsx`:
  - Page background: static `bg-[#F8FAFC]`, never `branding.bgColor`.
  - Text tokens: `#0F172A` (primary), `#64748B` (secondary), `#94A3B8` (tertiary/placeholder).
  - Borders: `#E2E8F0`.
  - `branding.primaryColour` is applied via inline `style` (e.g. `style={{ backgroundColor: branding.primaryColour }}`) — never via a Tailwind arbitrary-value class like `` bg-[${var}] `` (that syntax requires a build-time-static string; a runtime variable there is a silent no-op).
  - Buttons and input/textarea focus rings stay the static `#6366F1` already used everywhere in this codebase (admin portal and every other candidate page) — this plan does not make those dynamic, since no precedent for that exists anywhere in the app.
- **Explicitly excluded from this plan**: the full-screen violation/lockout overlays in `app/candidate/exam/page.tsx` (screenshot-blocked, fullscreen-exit, camera-blocked, multi-display-detected) stay solid black/dark exactly as they are today — confirmed, deliberate decision from the design spec. Do not touch any of those four overlay blocks. Also excluded: `TabSwitchModal`, `BroadcastToast`, `CameraSelfView` components (not mentioned in the design spec, out of scope) and `RatingCard`'s semantic red→green color scale (`COLORS` array) — that's a meaningful rating gradient, not a brand color, and stays unchanged.
- A hex color with an appended 2-digit alpha suffix (e.g. `` `${branding.primaryColour}1A` `` for ~10% opacity) is this plan's technique for a tinted background from a dynamic color — used because Tailwind's `/10` opacity modifier only works on static color classes, not inline styles. `branding.primaryColour` is always stored as a 6-digit hex (`OrgBranding.primaryColour` default `"#3730A3"`), so this is safe.
- Dev server: `npm run dev`. No dev server or browser is available to any implementer this session — manual-verification steps in this plan are written for whoever performs them later with real dev-server + browser access, not for the implementer subagent to attempt.

---

### Task 1: Exam page — light theme, thread `branding` to children

**Files:**
- Modify: `app/candidate/exam/page.tsx`

**Interfaces:**
- Consumes: `useBranding()` (`lib/use-branding.ts`, existing, unmodified).
- Produces: a `branding: Branding` prop passed to `McqCard`, `PsychometricCard`, `RatingCard`, `TextAnswerCard`, `QuestionProgress`, `TimerRing` — every later task in this plan depends on its component accepting this new prop.

- [ ] **Step 1: Import and call `useBranding()`**

Replace:

```tsx
import { SocketEvents, QuestionType, type PublicQuestion } from "@/types";
import { SETTINGS_DEFAULTS, type AssessmentSettings } from "@/lib/get-settings";
```

with:

```tsx
import { SocketEvents, QuestionType, type PublicQuestion } from "@/types";
import { SETTINGS_DEFAULTS, type AssessmentSettings } from "@/lib/get-settings";
import { useBranding } from "@/lib/use-branding";
```

Replace:

```tsx
export default function ExamPage() {
  const router = useRouter();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
```

with:

```tsx
export default function ExamPage() {
  const router = useRouter();
  const branding = useBranding();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
```

- [ ] **Step 2: Reskin the loading state**

Replace:

```tsx
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading question...</div>
      </div>
    );
  }
```

with:

```tsx
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-[#0F172A] text-xl animate-pulse">Loading question...</div>
      </div>
    );
  }
```

- [ ] **Step 3: Reskin the main container and sticky header**

Replace:

```tsx
  return (
    <div className="min-h-screen bg-gray-900 text-white select-none">
```

with:

```tsx
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] select-none">
```

Replace:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="sticky top-0 z-30 mb-8 flex items-end gap-6 bg-gray-900 py-3">
```

with:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="sticky top-0 z-30 mb-8 flex items-end gap-6 bg-[#F8FAFC] py-3">
```

Do NOT touch the four overlay blocks (`screenshotFlash`, `fullscreenWarning`, `cameraWarning`, `multiDisplayWarning`) — they keep their existing `bg-black/95`/`bg-black/90` and `text-white`/`text-gray-400`/`text-gray-500` classes unchanged. They render as `fixed inset-0` layers with their own background, independent of the outer container's color, so this step doesn't affect them either way — just don't edit those blocks.

- [ ] **Step 4: Pass `branding` down to every child that needs it**

Replace:

```tsx
        <div className="sticky top-0 z-30 mb-8 flex items-end gap-6 bg-[#F8FAFC] py-3">
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={progress.answered}
            />
          )}
          <div className="shrink-0">
            <TimerRing
              key={question.id}
              timeLimit={question.timeLimitSec}
              onExpire={handleTimerExpire}
              paused={multiDisplayWarning}
            />
          </div>
        </div>

        {(question.type === QuestionType.MCQ || question.type === QuestionType.IMAGE) && (
          <McqCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.PSYCHOMETRIC && (
          <PsychometricCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.RATING && (
          <RatingCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.SHORT_ANSWER && (
          <TextAnswerCard question={question} variant="short" onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.LONG_ANSWER && (
          <TextAnswerCard question={question} variant="long" onAnswer={(v) => handleAnswer(v)} />
        )}
```

with:

```tsx
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

        {(question.type === QuestionType.MCQ || question.type === QuestionType.IMAGE) && (
          <McqCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
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
```

- [ ] **Step 5: Type-check**

Run (PowerShell): `npx tsc --noEmit -p tsconfig.json`

Expected: errors will appear because `McqCard`/`PsychometricCard`/`RatingCard`/`TextAnswerCard`/`QuestionProgress`/`TimerRing` don't yet accept a `branding` prop — that's expected and fixed by Tasks 2-7. Confirm there are no errors *inside* `app/candidate/exam/page.tsx` itself (the errors should all point at the child components' prop types, not at this file's own logic).

- [ ] **Step 6: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "feat(exam): reskin exam page to light branding-aware theme, thread branding to answer cards"
```

---

### Task 2: `McqCard` — light theme + branded selected state

**Files:**
- Modify: `components/exam/McqCard.tsx`

**Interfaces:**
- Consumes: `Branding` type (`lib/use-branding.ts`).
- Produces: `McqCard` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired).

- [ ] **Step 1: Replace the whole file**

This file is small enough that every visible class changes — replace the entire contents:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface McqCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number) => void;
}

const LETTERS = ["A", "B", "C", "D"];

export default function McqCard({ question, branding, onAnswer }: McqCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(index: number) {
    if (selected !== null) return;
    setSelected(index);
    onAnswer(index);
  }

  return (
    <div className="w-full max-w-2xl">
      {question.imageUrl && (
        <div className="relative mb-6 h-64 w-full overflow-hidden rounded-lg bg-[#F1F5F9]">
          <Image
            src={question.imageUrl}
            alt="Question"
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-contain"
          />
        </div>
      )}
      <p className="mb-6 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <div className="grid grid-cols-2 gap-4">
        {question.options.map((option, index) => {
          const isSelected = selected === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={selected !== null}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                isSelected ? "" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isSelected ? "text-white" : "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                }`}
                style={isSelected ? { backgroundColor: branding.primaryColour } : undefined}
              >
                {LETTERS[index]}
              </span>
              <span className="text-[#0F172A]">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect the `McqCard` usage error from Task 1 to be gone now; other child-component errors (Tasks 3-7, not yet done) are still expected.

Run: `npx eslint components/exam/McqCard.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/McqCard.tsx
git commit -m "feat(exam): reskin McqCard to light theme with branded selected state"
```

---

### Task 3: `PsychometricCard` — light theme + branded selected state

**Files:**
- Modify: `components/exam/PsychometricCard.tsx`

**Interfaces:**
- Consumes: `Branding` type.
- Produces: `PsychometricCard` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired).

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface PsychometricCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number) => void;
}

const MOODS = [
  { emoji: "😢", value: 1, label: "Very unhappy" },
  { emoji: "😕", value: 2, label: "Unhappy" },
  { emoji: "😐", value: 3, label: "Neutral" },
  { emoji: "🙂", value: 4, label: "Happy" },
  { emoji: "😄", value: 5, label: "Very happy" },
];

export default function PsychometricCard({ question, branding, onAnswer }: PsychometricCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(value: number) {
    if (selected !== null) return;
    setSelected(value);
    onAnswer(value);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-8 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <div className="flex items-center justify-between gap-2">
        {MOODS.map((mood) => {
          const isSelected = selected === mood.value;
          return (
            <button
              key={mood.value}
              type="button"
              onClick={() => handleSelect(mood.value)}
              disabled={selected !== null}
              className={`flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                isSelected ? "scale-110" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span className="text-4xl">{mood.emoji}</span>
              <span className="text-xs text-[#64748B]">{mood.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — the `PsychometricCard` usage error should be gone.

Run: `npx eslint components/exam/PsychometricCard.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/PsychometricCard.tsx
git commit -m "feat(exam): reskin PsychometricCard to light theme with branded selected state"
```

---

### Task 4: `RatingCard` — light theme, keep the semantic color scale

**Files:**
- Modify: `components/exam/RatingCard.tsx`

**Interfaces:**
- Consumes: `Branding` type.
- Produces: `RatingCard` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired).

- [ ] **Step 1: Replace the whole file**

The `COLORS` array (the red→green rating gradient) is unchanged — it's a meaningful scale, not a brand color. Only the heading text and the selected-state ring change (a `ring-4 ring-white` is invisible against this plan's new light background, so it's replaced with a branded ring via inline `boxShadow`):

```tsx
"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface RatingCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number) => void;
}

// index 0 -> button "1" (reddest) ... index 9 -> button "10" (greenest)
const COLORS = [
  "bg-red-600",
  "bg-red-500",
  "bg-orange-500",
  "bg-orange-400",
  "bg-yellow-500",
  "bg-yellow-400",
  "bg-lime-500",
  "bg-lime-400",
  "bg-green-500",
  "bg-green-600",
];

export default function RatingCard({ question, branding, onAnswer }: RatingCardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(value: number) {
    if (selected !== null) return;
    setSelected(value);
    onAnswer(value);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-8 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <div className="grid grid-cols-5 gap-3 sm:grid-cols-10">
        {COLORS.map((color, i) => {
          const value = i + 1;
          const isSelected = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSelect(value)}
              disabled={selected !== null}
              className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white transition-all ${color} ${
                isSelected ? "scale-110" : ""
              } ${selected !== null && !isSelected ? "opacity-40" : ""}`}
              style={isSelected ? { boxShadow: `0 0 0 4px ${branding.primaryColour}` } : undefined}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — the `RatingCard` usage error should be gone.

Run: `npx eslint components/exam/RatingCard.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/RatingCard.tsx
git commit -m "feat(exam): reskin RatingCard heading and selection ring, keep semantic color scale"
```

---

### Task 5: `TextAnswerCard` — light theme

**Files:**
- Modify: `components/exam/TextAnswerCard.tsx`

**Interfaces:**
- Consumes: `Branding` type.
- Produces: `TextAnswerCard` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired). Note: `branding` is accepted for interface consistency with every other card in this plan, but per Global Constraints this component's textarea focus ring and submit button stay the static `#6366F1` — there is no dynamic use of `branding` inside this particular file's rendering, only the prop threading.

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface TextAnswerCardProps {
  question: PublicQuestion;
  variant: "short" | "long";
  branding: Branding;
  onAnswer: (value: string) => void;
}

// Fallback limits only used if a question somehow has no wordLimit set
// (shouldn't happen for short_answer/long_answer created via the admin UI,
// which always requires one — this just avoids an unbounded textarea).
const FALLBACK_LIMIT: Record<TextAnswerCardProps["variant"], number> = {
  short: 50,
  long: 500,
};

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

// Truncates `text` to at most `limit` words. Splits on whitespace runs so
// trailing spaces the candidate is still typing are preserved rather than
// eaten mid-keystroke.
function truncateToWordLimit(text: string, limit: number): string {
  const tokens = text.split(/(\s+)/);
  let wordCount = 0;
  let result = "";
  for (const token of tokens) {
    if (token.trim() === "") {
      result += token;
      continue;
    }
    if (wordCount >= limit) break;
    wordCount += 1;
    result += token;
  }
  return result;
}

export default function TextAnswerCard({ question, variant, onAnswer }: TextAnswerCardProps) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const limit = question.wordLimit ?? FALLBACK_LIMIT[variant];
  const wordCount = countWords(text);
  const atLimit = wordCount >= limit;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setText(countWords(next) > limit ? truncateToWordLimit(next, limit) : next);
  }

  function handleSubmit() {
    if (submitted || text.trim() === "") return;
    setSubmitted(true);
    onAnswer(text.trim());
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-6 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <textarea
        rows={variant === "short" ? 3 : 10}
        value={text}
        onChange={handleChange}
        disabled={submitted}
        placeholder={variant === "short" ? "Type your short answer…" : "Type your long answer…"}
        className="w-full rounded-xl border border-[#E2E8F0] bg-white p-4 text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs font-medium ${atLimit ? "text-amber-600" : "text-[#64748B]"}`}>
          {wordCount} / {limit} words
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitted || text.trim() === ""}
          className="rounded-lg bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-40"
        >
          {submitted ? "Submitted" : "Submit answer"}
        </button>
      </div>
    </div>
  );
}
```

Note: the function signature intentionally still destructures only `{ question, variant, onAnswer }` — `branding` is part of the props interface (so Task 1's call site type-checks and the component is consistent with its siblings) but isn't used in this file's JSX, per the Global Constraint that this component's static colors don't change. TypeScript/ESLint won't flag an unused *destructured-but-omitted* prop (it's simply not pulled out of the props object), so this is not an unused-variable warning — verify that's actually true in Step 2 rather than assuming.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — the `TextAnswerCard` usage error should be gone.

Run: `npx eslint components/exam/TextAnswerCard.tsx` — expect no errors. If ESLint's `no-unused-vars` (or a related rule) somehow flags `branding` in the props interface, that would be surprising for an interface-only property — if it happens, report it as a concern rather than silently adding an unused destructure just to silence it.

- [ ] **Step 3: Commit**

```bash
git add components/exam/TextAnswerCard.tsx
git commit -m "feat(exam): reskin TextAnswerCard to light theme"
```

---

### Task 6: `QuestionProgress` — light theme + branded fill

**Files:**
- Modify: `components/exam/QuestionProgress.tsx`

**Interfaces:**
- Consumes: `Branding` type.
- Produces: `QuestionProgress` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired).

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import type { Branding } from "@/lib/use-branding";

interface QuestionProgressProps {
  answered: number;   // questions already submitted (not counting current)
  total: number;
  currentIndex: number; // 0-based orderIndex of the current question
  branding: Branding;
}

export default function QuestionProgress({ answered, total, currentIndex, branding }: QuestionProgressProps) {
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
        <span className="text-2xl font-extrabold text-[#0F172A] tabular-nums leading-none">
          {answered + 1}
        </span>
        <span className="text-sm font-medium text-[#64748B]">
          of {total}
        </span>
        <span className="ml-auto text-xs font-medium text-[#94A3B8]">
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
                className={`flex-1 h-full rounded-full transition-all duration-500 ${
                  isDone ? "" : isCurrent ? "animate-pulse" : "bg-[#E2E8F0]"
                }`}
                style={
                  isDone
                    ? { backgroundColor: branding.primaryColour }
                    : isCurrent
                    ? { backgroundColor: `${branding.primaryColour}66`, boxShadow: `0 0 0 1px ${branding.primaryColour}99` }
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        /* Smooth progress bar for large sets */
        <div className="relative h-2 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: branding.primaryColour }}
          />
          {/* Glint overlay */}
          <div
            className="absolute left-0 top-0 h-full w-8 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-all duration-500 ease-out"
            style={{ left: `calc(${pct}% - 16px)` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — the `QuestionProgress` usage error should be gone.

Run: `npx eslint components/exam/QuestionProgress.tsx` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/QuestionProgress.tsx
git commit -m "feat(exam): reskin QuestionProgress to light theme with branded fill"
```

---

### Task 7: `TimerRing` — light track + branded "plenty of time" color

**Files:**
- Modify: `components/exam/TimerRing.tsx`

**Interfaces:**
- Consumes: `Branding` type.
- Produces: `TimerRing` now requires a `branding: Branding` prop. Consumed by Task 1 (already wired). This is the final task resolving every "expected downstream error" from Task 1 — after this task, `tsc --noEmit` should report zero errors project-wide.

- [ ] **Step 1: Replace the whole file**

Only the track color, the ">50% time remaining" arc color, and the center text color change. The yellow (`#eab308`, 25-50% remaining) and red (`#ef4444`, <25% remaining) warning colors are semantic urgency indicators and stay unchanged — they should mean the same thing regardless of the organization's brand color.

```tsx
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
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect **zero errors project-wide** now (this is the last child component Task 1 passes `branding` to).

Run: `npx eslint components/exam/TimerRing.tsx` — expect no errors.

- [ ] **Step 3: Manually verify the full exam page in the browser** (deferred if unavailable — note in report)

1. Start an exam as a candidate. Expected: light background (`#F8FAFC`), dark question text, white answer cards with light borders — no more dark theme.
2. Select an MCQ option. Expected: the selected option's border/background tint and its lettered badge use the campaign's/org's primary color (test with a non-default `OrgBranding.primaryColour` set via the admin branding page, to confirm it's not just coincidentally matching the `#6366F1` default).
3. Watch the timer ring for a low-time-limit question. Expected: ring starts in the branded color, transitions to yellow then red as time runs low — colors don't change with a different org color for the yellow/red segments.
4. Confirm the four violation overlays (trigger a screenshot key, exit fullscreen if enabled, etc., as applicable to the test campaign's anti-cheat settings) are still solid black/dark, unaffected by this reskin.
5. Confirm progress pills/bar reflect the branded color for "answered" segments.

- [ ] **Step 4: Commit**

```bash
git add components/exam/TimerRing.tsx
git commit -m "feat(exam): reskin TimerRing to light track with branded time-remaining color"
```

---

### Task 8: Result page — light branding-aware theme

**Files:**
- Modify: `app/candidate/result/page.tsx`

**Interfaces:**
- Consumes: `useBranding()`.
- Produces: nothing consumed elsewhere — final task in this plan.

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useBranding } from "@/lib/use-branding";

export default function ResultPage() {
  const branding = useBranding();
  const [message, setMessage] = useState<string | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const msg = sessionStorage.getItem("completionMessage");
    const total = sessionStorage.getItem("totalQuestions");
    setMessage(msg);
    if (total) setTotalQuestions(Number(total));
    // Animate in after mount
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div
        className={`w-full max-w-lg text-center transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* Animated checkmark */}
        <div className="mx-auto mb-8 relative flex items-center justify-center">
          <div
            className="h-28 w-28 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${branding.primaryColour}1A`, boxShadow: `inset 0 0 0 1px ${branding.primaryColour}4D` }}
          >
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${branding.primaryColour}33`, boxShadow: `inset 0 0 0 1px ${branding.primaryColour}80` }}
            >
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke={branding.primaryColour}
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          {/* Radiating ring animation */}
          <div
            className="absolute inset-0 rounded-full border animate-ping"
            style={{ borderColor: `${branding.primaryColour}33`, animationDuration: "2.5s" }}
          />
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-extrabold text-[#0F172A] mb-2 tracking-tight">
          Assessment Complete
        </h1>

        {totalQuestions !== null && (
          <p className="text-sm text-[#64748B] mb-6">
            {totalQuestions} question{totalQuestions !== 1 ? "s" : ""} answered
          </p>
        )}

        {/* Divider */}
        <div className="w-12 h-px mx-auto mb-6" style={{ backgroundColor: `${branding.primaryColour}66` }} />

        {/* Custom message or default */}
        <p className="text-[#334155] text-base leading-relaxed whitespace-pre-line">
          {message ??
            "Thank you for completing the assessment. Results will be communicated to you shortly."}
        </p>

        {/* Bottom note */}
        <p className="mt-10 text-xs text-[#94A3B8]">
          You may now close this window.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect zero errors project-wide.

Run: `npx eslint app/candidate/result/page.tsx` — expect no errors.

- [ ] **Step 3: Manually verify in the browser** (deferred if unavailable — note in report)

1. Complete an exam as a candidate, land on the result page. Expected: light background, dark heading text, the checkmark circles and divider tinted with the org's primary color instead of a hardcoded indigo.
2. Test with a campaign that has a custom `completionMessage` set — confirm it still renders in the new lighter body-text color and remains legible.
3. Test with a campaign using the default branding (no custom `OrgBranding` row) — confirm the fallback `#6366F1` primary color renders sensibly (this is `DEFAULT.primaryColour` in `lib/use-branding.ts`, already used as the fallback everywhere else).

- [ ] **Step 4: Commit**

```bash
git add app/candidate/result/page.tsx
git commit -m "feat(result): reskin result page to light branding-aware theme"
```

---

## Post-plan sanity pass

- [ ] Run `npx tsc --noEmit -p tsconfig.json` once more from a clean state — expect zero errors across the whole plan's changes.
- [ ] Run `npx eslint app components` — expect no new errors.
- [ ] On a real dev server, walk through the full candidate journey end-to-end with a campaign that has a non-default `OrgBranding.primaryColour` set: login → instructions → waiting room → exam (all question types, including the new Short/Long Answer types from the companion plan) → result. Confirm the primary color appears consistently across every page that uses it, and that the exam/result pages no longer look visually disconnected from the rest of the journey.
- [ ] Confirm the four anti-cheat violation overlays on the exam page are untouched — still solid black/dark.
