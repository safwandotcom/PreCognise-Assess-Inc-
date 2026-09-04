# Multi-select MCQ Question Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new question type — Multi-select MCQ — supporting 2–8 admin-configurable options with more than one marked correct, scored as an exact-set match.

**Architecture:** A new `correctOptions Int[]` column on `Question` sits alongside the existing single `correctOption`, used only by the new type. `isOptionBasedQuestionType()` (already the single source of truth added when True/False shipped) picks the new type up automatically for shuffling and most analytics. Scoring adds one pure helper (`isMultiSelectAnswerCorrect`) to `lib/scoring.ts`; `calculateScore()` itself is untouched. The candidate answers via a new `MultiSelectCard` component (checkboxes + explicit Submit, mirroring `TextAnswerCard`'s select-then-confirm pattern, not `McqCard`'s click-and-lock). Two pre-existing per-type assumptions (negative-marking eligibility, option-frequency counting) get generalized so they don't silently misbehave for the new type, the same class of bug caught twice already while adding True/False.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / PostgreSQL (Neon), React 19, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-multi-select-question-type-design.md`

## Global Constraints

- Scoring is exact-set match only — no partial credit. Candidate's selected set must equal `correctOptions` exactly (same length, same members) to score; anything else is 0, same binary model as every other type.
- Option count: 2–8, enforced in the builder (both by disabling Add/Remove past the bounds, and by a submit-time validation check).
- `correctCount` (just the number of correct options, never which ones) is the only answer-key data ever sent to the candidate — via `PublicQuestion.correctCount`.
- Submit button is enabled once ≥1 option is checked — never locked to exactly `correctCount` selections (that would leak the answer key's shape).
- New Prisma field: `correctOptions Int[] @default([])` on `Question`. New enum value: `QuestionType.MULTI_SELECT = "multi_select"` / Prisma `multi_select`. Applied via `prisma db push` (project convention — `migrate dev` is avoided due to pre-existing Neon migration-history drift), never `migrate dev`.
- **No test runner exists for the Next.js app itself** (only `socket-server/` has Jest — confirmed absent for `app/`, `lib/`, `components/`). Every task's verification step is `npx tsc --noEmit` + `npx eslint <touched files>` + (for the final task) a full `npm run build`, matching the verification approach already used for the True/False and fullscreen-fix work in this repo — not a write-failing-test-first cycle, because there is nothing to run it with.
- Match existing code style exactly: 2-space indent in `.ts`/`.tsx`, Tailwind utility classes with the existing hex palette (`#6366F1` primary, `#0F172A` text, `#64748B` muted, `#E2E8F0` border, `#F1F5F9` subtle bg), inline comments explaining *why* not *what* (see any recently-touched file in this repo for tone).

---

## File Map

- `prisma/schema.prisma` — MODIFY: new `correctOptions` field + enum value.
- `types/index.ts` — MODIFY: new enum value, `isOptionBasedQuestionType`, `AnswerPayload.value`, `PublicQuestion.correctCount`.
- `lib/scoring.ts` — MODIFY: new `isMultiSelectAnswerCorrect` helper.
- `app/api/admin/campaigns/[id]/questions/route.ts` — MODIFY: persist `correctOptions` on create.
- `app/api/admin/questions/[id]/route.ts` — MODIFY: persist `correctOptions` on update.
- `app/api/assessment/submit-answer/route.ts` — MODIFY: array-aware unshuffle + set-equality scoring branch.
- `app/api/assessment/next-question/route.ts` — MODIFY: populate `correctCount`.
- `app/api/admin/campaigns/[id]/analytics/route.ts` — MODIFY: drop redundant negative-marking guard, fix option-frequency counting.
- `app/api/admin/campaigns/[id]/results/route.ts` — MODIFY: drop redundant negative-marking guard.
- `components/exam/MultiSelectCard.tsx` — CREATE: candidate-facing checkbox card.
- `app/candidate/exam/page.tsx` — MODIFY: import + render branch + broadened value types.
- `app/admin/campaigns/[id]/page.tsx` — MODIFY: builder type tile, variable-length options editor, multi-correct picker, validation, list badge.

---

### Task 1: Data model + shared types

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `QuestionType.MULTI_SELECT` (`"multi_select"`), `isOptionBasedQuestionType()` now includes it, `AnswerPayload.value: number | number[] | string | null`, `PublicQuestion.correctCount: number | null` — every later task depends on these.

- [ ] **Step 1: Add the Prisma enum value and column**

In `prisma/schema.prisma`, the `QuestionType` enum currently reads (around line 27):

```prisma
enum QuestionType {
  mcq
  psychometric
  rating
  image
  short_answer
  long_answer
  true_false
}
```

Change to:

```prisma
enum QuestionType {
  mcq
  psychometric
  rating
  image
  short_answer
  long_answer
  true_false
  multi_select
}
```

Find the `Question` model (search for `model Question {`) and add `correctOptions` immediately after the existing `correctOption` field:

```prisma
  correctOption  Int?
  correctOptions Int[]   @default([])
```

- [ ] **Step 2: Push the schema and regenerate the client**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.` followed by `Generated Prisma Client`.

- [ ] **Step 3: Add the TypeScript enum value and helper updates**

In `types/index.ts`, the `QuestionType` enum currently reads:

```typescript
export enum QuestionType {
  MCQ = "mcq",
  PSYCHOMETRIC = "psychometric",
  RATING = "rating",
  IMAGE = "image",
  SHORT_ANSWER = "short_answer",
  LONG_ANSWER = "long_answer",
  TRUE_FALSE = "true_false",
}
```

Change to:

```typescript
export enum QuestionType {
  MCQ = "mcq",
  PSYCHOMETRIC = "psychometric",
  RATING = "rating",
  IMAGE = "image",
  SHORT_ANSWER = "short_answer",
  LONG_ANSWER = "long_answer",
  TRUE_FALSE = "true_false",
  MULTI_SELECT = "multi_select",
}
```

`isOptionBasedQuestionType` currently reads:

```typescript
export function isOptionBasedQuestionType(type: string): boolean {
  return (
    type === QuestionType.MCQ ||
    type === QuestionType.IMAGE ||
    type === QuestionType.TRUE_FALSE
  );
}
```

Change to:

```typescript
export function isOptionBasedQuestionType(type: string): boolean {
  return (
    type === QuestionType.MCQ ||
    type === QuestionType.IMAGE ||
    type === QuestionType.TRUE_FALSE ||
    type === QuestionType.MULTI_SELECT
  );
}
```

`PublicQuestion` currently reads:

```typescript
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: (string | number)[];
  wordLimit: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}
```

Add `correctCount` (comment updated to explain the new field's disclosure boundary):

```typescript
// Sanitized question shape sent to the candidate client.
// correctOption/correctOptions must never appear here — only the COUNT of
// correct options for multi-select (correctCount), never which ones.
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: (string | number)[];
  wordLimit: number | null;
  correctCount: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}
```

`AnswerPayload` currently reads:

```typescript
// What the candidate's client sends to submit-answer.
// value is null when the timer expired and the question was skipped; a
// string for short_answer/long_answer questions, a number (option index or
// mood/rating value) for every other type.
export interface AnswerPayload {
  questionId: string;
  value: number | string | null;
  responseTimeMs: number;
}
```

Change to:

```typescript
// What the candidate's client sends to submit-answer.
// value is null when the timer expired and the question was skipped; a
// string for short_answer/long_answer questions, a number[] of selected
// display-indices for multi_select, a number (option index or mood/rating
// value) for every other type.
export interface AnswerPayload {
  questionId: string;
  value: number | number[] | string | null;
  responseTimeMs: number;
}
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors (existing call sites of `PublicQuestion`/`AnswerPayload` still satisfy the widened types — widening a union and adding an optional-shaped-but-required field with an explicit `null` default at every construction site is backward compatible as long as every constructor is updated in a later task; this step may show errors at construction sites like `next-question/route.ts` until Task 4 runs — if so, note them and continue, they're expected until that task lands).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma types/index.ts
git commit -m "feat(schema): add multi_select question type and correctOptions column"
```

---

### Task 2: Admin question create/update APIs persist `correctOptions`

**Files:**
- Modify: `app/api/admin/campaigns/[id]/questions/route.ts`
- Modify: `app/api/admin/questions/[id]/route.ts`

**Interfaces:**
- Consumes: `correctOptions` field on `Question` (Task 1).
- Produces: both routes accept and persist a `correctOptions: number[]` field in their request bodies, alongside the existing `correctOption`.

- [ ] **Step 1: Update the POST (create) route**

In `app/api/admin/campaigns/[id]/questions/route.ts`, the `POST` handler currently reads:

```typescript
  const body = await req.json();
  const { type, text, imageUrl, options, correctOption, wordLimit, timeLimitSec, basePoints, speedBonusMax } = body;

  const count = await prisma.question.count({ where: { campaignId: id } });
  const question = await prisma.question.create({
    data: {
      type,
      text,
      imageUrl: imageUrl ?? null,
      options,
      correctOption: correctOption ?? null,
      wordLimit: wordLimit ?? null,
      timeLimitSec,
      basePoints,
      speedBonusMax: speedBonusMax ?? 0,
      orderIndex: count,
      campaignId: id,
    },
  });
```

Change to:

```typescript
  const body = await req.json();
  const { type, text, imageUrl, options, correctOption, correctOptions, wordLimit, timeLimitSec, basePoints, speedBonusMax } = body;

  const count = await prisma.question.count({ where: { campaignId: id } });
  const question = await prisma.question.create({
    data: {
      type,
      text,
      imageUrl: imageUrl ?? null,
      options,
      correctOption: correctOption ?? null,
      correctOptions: correctOptions ?? [],
      wordLimit: wordLimit ?? null,
      timeLimitSec,
      basePoints,
      speedBonusMax: speedBonusMax ?? 0,
      orderIndex: count,
      campaignId: id,
    },
  });
```

- [ ] **Step 2: Update the PATCH (edit) route**

In `app/api/admin/questions/[id]/route.ts`, the `PATCH` handler's `data` object currently reads:

```typescript
    data: {
      ...(body.type !== undefined && { type: body.type }),
      ...(body.text !== undefined && { text: body.text }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.options !== undefined && { options: body.options }),
      ...(body.correctOption !== undefined && { correctOption: body.correctOption }),
      ...(body.timeLimitSec !== undefined && { timeLimitSec: body.timeLimitSec }),
      ...(body.basePoints !== undefined && { basePoints: body.basePoints }),
      ...(body.speedBonusMax !== undefined && { speedBonusMax: body.speedBonusMax }),
    },
```

Change to:

```typescript
    data: {
      ...(body.type !== undefined && { type: body.type }),
      ...(body.text !== undefined && { text: body.text }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
      ...(body.options !== undefined && { options: body.options }),
      ...(body.correctOption !== undefined && { correctOption: body.correctOption }),
      ...(body.correctOptions !== undefined && { correctOptions: body.correctOptions }),
      ...(body.timeLimitSec !== undefined && { timeLimitSec: body.timeLimitSec }),
      ...(body.basePoints !== undefined && { basePoints: body.basePoints }),
      ...(body.speedBonusMax !== undefined && { speedBonusMax: body.speedBonusMax }),
    },
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint "app/api/admin/campaigns/[id]/questions/route.ts" "app/api/admin/questions/[id]/route.ts"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/campaigns/[id]/questions/route.ts" "app/api/admin/questions/[id]/route.ts"
git commit -m "feat(api): persist correctOptions on question create/update"
```

---

### Task 3: Scoring — exact-set match + array-aware answer-shuffling

**Files:**
- Modify: `lib/scoring.ts`
- Modify: `app/api/assessment/submit-answer/route.ts`

**Interfaces:**
- Consumes: `isOptionBasedQuestionType`, `QuestionType` (Task 1).
- Produces: `isMultiSelectAnswerCorrect(selected: number[], correctOptions: number[]): boolean` (exported from `lib/scoring.ts`) — a pure, order-independent exact-set equality check. `submit-answer/route.ts` now computes `isCorrect` correctly for `multi_select` and unshuffles an array of selected indices, not just one.

- [ ] **Step 1: Add the scoring helper**

In `lib/scoring.ts`, add this function (the file currently only exports `calculateScore` — this is a new, second export, placed above it since `calculateScore` doesn't call it, `submit-answer/route.ts` calls both independently):

```typescript
/**
 * Exact-set equality check for multi-select answers — order-independent.
 * The candidate's selected set must match the correct set precisely (same
 * length, same members) to count as correct; there is no partial credit.
 * Used by submit-answer to compute isCorrect for QuestionType.MULTI_SELECT,
 * which stores its answer key as an array (correctOptions) rather than the
 * single correctOption index every other option-based type uses.
 */
export function isMultiSelectAnswerCorrect(
  selected: number[],
  correctOptions: number[]
): boolean {
  if (selected.length !== correctOptions.length) return false;
  const sortedSelected = [...selected].sort((a, b) => a - b);
  const sortedCorrect = [...correctOptions].sort((a, b) => a - b);
  return sortedSelected.every((v, i) => v === sortedCorrect[i]);
}
```

- [ ] **Step 2: Rewrite the unshuffle + isCorrect logic in submit-answer**

In `app/api/assessment/submit-answer/route.ts`, this block currently reads (around line 90-107):

```typescript
  // If answer-shuffling is on for this campaign, `value` is the index the
  // candidate clicked in *their* shuffled view — translate it back to the
  // canonical index stored in `question.correctOption` before scoring, and
  // before persisting, so analytics stay meaningful regardless of shuffling.
  const shouldUnshuffle =
    question.campaign.antiCheatShuffleAnswers &&
    isOptionBasedQuestionType(question.type);

  const canonicalValue =
    shouldUnshuffle && typeof value === "number"
      ? translateDisplayIndexToCanonical(
          value,
          (question.options as (string | number)[]).length,
          `${candidateId}:${questionId}`,
        )
      : value;

  const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
```

Change to:

```typescript
  // If answer-shuffling is on for this campaign, `value` is the index (or,
  // for multi_select, indices) the candidate clicked in *their* shuffled
  // view — translate back to canonical index(es) before scoring and before
  // persisting, so analytics stay meaningful regardless of shuffling.
  const shouldUnshuffle =
    question.campaign.antiCheatShuffleAnswers &&
    isOptionBasedQuestionType(question.type);

  const optionCount = (question.options as (string | number)[]).length;
  const shuffleSeed = `${candidateId}:${questionId}`;

  const canonicalValue = !shouldUnshuffle
    ? value
    : Array.isArray(value)
      ? value.map((displayIndex) =>
          translateDisplayIndexToCanonical(displayIndex, optionCount, shuffleSeed)
        )
      : typeof value === "number"
        ? translateDisplayIndexToCanonical(value, optionCount, shuffleSeed)
        : value;

  const isCorrect =
    question.type === "multi_select"
      ? Array.isArray(canonicalValue) &&
        isMultiSelectAnswerCorrect(canonicalValue, question.correctOptions)
      : question.correctOption !== null && canonicalValue === question.correctOption;
```

- [ ] **Step 3: Add the new import**

At the top of `app/api/assessment/submit-answer/route.ts`, the import currently reads:

```typescript
import { calculateScore } from "@/lib/scoring";
```

Change to:

```typescript
import { calculateScore, isMultiSelectAnswerCorrect } from "@/lib/scoring";
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint lib/scoring.ts app/api/assessment/submit-answer/route.ts
```

Expected: no errors. (`isTextQuestion` validation earlier in the same file only rejects non-string values for text questions — it does not need changes, since it never runs for `multi_select`.)

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts app/api/assessment/submit-answer/route.ts
git commit -m "feat(scoring): exact-set match scoring and array-aware unshuffle for multi-select"
```

---

### Task 4: Candidate delivery — populate `correctCount`

**Files:**
- Modify: `app/api/assessment/next-question/route.ts`

**Interfaces:**
- Consumes: `PublicQuestion.correctCount` (Task 1), `next.correctOptions` (Task 1, Prisma field, available on the unfiltered `findUnique` already in this route).
- Produces: every `PublicQuestion` sent to a candidate now includes `correctCount`.

- [ ] **Step 1: Populate the field**

In `app/api/assessment/next-question/route.ts`, the `PublicQuestion` construction currently reads:

```typescript
    const question: PublicQuestion = {
        id: next.id,
        type: next.type as unknown as QuestionType,
        text: next.text,
        imageUrl: next.imageUrl,
        options: displayOptions,
        wordLimit: next.wordLimit,
        timeLimitSec: next.timeLimitSec,
        basePoints: next.basePoints,
        // Respect global speed bonus toggle — zero it out if disabled
        speedBonusMax: settings.speedBonusEnabled ? next.speedBonusMax : 0,
        orderIndex: candidate.campaign?.antiCheatShuffleQuestions ? -1 : next.orderIndex,
    };
```

Change to:

```typescript
    const question: PublicQuestion = {
        id: next.id,
        type: next.type as unknown as QuestionType,
        text: next.text,
        imageUrl: next.imageUrl,
        options: displayOptions,
        wordLimit: next.wordLimit,
        // Only the COUNT of correct options ever reaches the candidate —
        // never which ones. null for every type except multi_select.
        correctCount: next.type === "multi_select" ? next.correctOptions.length : null,
        timeLimitSec: next.timeLimitSec,
        basePoints: next.basePoints,
        // Respect global speed bonus toggle — zero it out if disabled
        speedBonusMax: settings.speedBonusEnabled ? next.speedBonusMax : 0,
        orderIndex: candidate.campaign?.antiCheatShuffleQuestions ? -1 : next.orderIndex,
    };
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint app/api/assessment/next-question/route.ts
```

Expected: no errors — this also clears any `PublicQuestion` construction error left over from Task 1 Step 4.

- [ ] **Step 3: Commit**

```bash
git add app/api/assessment/next-question/route.ts
git commit -m "feat(api): populate PublicQuestion.correctCount for multi-select"
```

---

### Task 5: Generalize negative marking and option-frequency analytics

**Files:**
- Modify: `app/api/admin/campaigns/[id]/analytics/route.ts`
- Modify: `app/api/admin/campaigns/[id]/results/route.ts`

**Interfaces:**
- Consumes: `isOptionBasedQuestionType` (already imported in both files from earlier work).
- Produces: negative marking and option-frequency counting both work correctly for `multi_select` responses, whose `answer` is a JSON array rather than a single number.

- [ ] **Step 1: Drop the redundant negative-marking guard in analytics/route.ts**

In `app/api/admin/campaigns/[id]/analytics/route.ts`, this block currently reads (around line 133-142):

```typescript
      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cRes) {
          if (r.answer !== null && r.score === 0 && isOptionBasedQuestionType(r.question.type)) {
            if (r.question.correctOption !== null && r.answer !== r.question.correctOption) {
              penalty += r.question.basePoints * campaign.negativeMarkingValue;
            }
          }
        }
      }
```

Change to:

```typescript
      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cRes) {
          // score === 0 on an auto-scored, option-based type that wasn't
          // skipped (answer !== null) already fully means "answered wrong" —
          // this doesn't need to re-derive "wrong" by comparing against
          // correctOption, which only exists for single-answer types and is
          // always null for multi_select (whose answer key lives in
          // correctOptions instead). Re-deriving it here previously meant
          // negative marking silently never applied to a wrong multi-select
          // answer.
          if (r.answer !== null && r.score === 0 && isOptionBasedQuestionType(r.question.type)) {
            penalty += r.question.basePoints * campaign.negativeMarkingValue;
          }
        }
      }
```

- [ ] **Step 2: Fix option-frequency counting in analytics/route.ts**

In the same file, this block currently reads (around line 230-236):

```typescript
      // Option frequency for MCQ/image/true-false
      let optionFrequency: number[] | null = null;
      if (isOptionBasedQuestionType(q.type) && Array.isArray(q.options)) {
        optionFrequency = (q.options as unknown[]).map((_, idx) =>
          qRes.filter(r => r.answer === idx).length
        );
      }
```

Change to:

```typescript
      // Option frequency for MCQ/image/true-false/multi-select. A
      // multi-select response's `answer` is a JSON array of selected
      // indices, not a single number — count an option as picked if the
      // candidate's array includes it, otherwise fall back to the plain
      // equality every single-answer type already uses.
      let optionFrequency: number[] | null = null;
      if (isOptionBasedQuestionType(q.type) && Array.isArray(q.options)) {
        optionFrequency = (q.options as unknown[]).map((_, idx) =>
          qRes.filter(r =>
            Array.isArray(r.answer) ? r.answer.includes(idx) : r.answer === idx
          ).length
        );
      }
```

- [ ] **Step 3: Drop the redundant negative-marking guard in results/route.ts**

In `app/api/admin/campaigns/[id]/results/route.ts`, this block currently reads (around line 93-115):

```typescript
      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cResponses) {
          if (
            r.answer !== null &&
            r.score === 0 &&
            isOptionBasedQuestionType(r.question.type)
          ) {
            // Wrong answer: answer !== null, score === 0
            // Verify it wasn't just unanswered (answer could be a Json value)
            // answer is Json; correctOption is Int. A null answer means skipped.
            // We check answer is not null (already done above) and score is 0
            // which means it was answered incorrectly (or was a wrong MCQ answer)
            const answerVal = r.answer;
            // Skip if answer is literally null (unanswered)
            if (answerVal === null) continue;
            // For MCQ/image: wrong means answer !== correctOption
            if (r.question.correctOption !== null && answerVal !== r.question.correctOption) {
              penalty += r.question.basePoints * campaign.negativeMarkingValue;
            }
          }
        }
      }
```

Change to:

```typescript
      let penalty = 0;
      if (campaign.negativeMarking) {
        for (const r of cResponses) {
          // score === 0 on an auto-scored, option-based type that wasn't
          // skipped (answer !== null) already fully means "answered wrong" —
          // this doesn't need to re-derive "wrong" by comparing against
          // correctOption, which only exists for single-answer types and is
          // always null for multi_select (whose answer key lives in
          // correctOptions instead). Re-deriving it here previously meant
          // negative marking silently never applied to a wrong multi-select
          // answer.
          if (
            r.answer !== null &&
            r.score === 0 &&
            isOptionBasedQuestionType(r.question.type)
          ) {
            penalty += r.question.basePoints * campaign.negativeMarkingValue;
          }
        }
      }
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint "app/api/admin/campaigns/[id]/analytics/route.ts" "app/api/admin/campaigns/[id]/results/route.ts"
```

Expected: no errors. (The `correctOption: true` select fields in both files' `question` selects become unused by this change — intentionally left in place; removing them is unrelated cleanup outside this task's scope.)

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/campaigns/[id]/analytics/route.ts" "app/api/admin/campaigns/[id]/results/route.ts"
git commit -m "fix(analytics): generalize negative-marking and option-frequency for multi-select"
```

---

### Task 6: Candidate UI — MultiSelectCard component

**Files:**
- Create: `components/exam/MultiSelectCard.tsx`
- Modify: `app/candidate/exam/page.tsx`

**Interfaces:**
- Consumes: `PublicQuestion` (with `correctCount`, Task 1), `Branding` type from `@/lib/use-branding`.
- Produces: `MultiSelectCard({ question, branding, onAnswer }: { question: PublicQuestion; branding: Branding; onAnswer: (value: number[]) => void })` — a new exam-question component; `app/candidate/exam/page.tsx` renders it for `QuestionType.MULTI_SELECT` and its `submitAnswer`/`handleAnswer` callbacks now accept `number[]` too.

- [ ] **Step 1: Create the component**

Create `components/exam/MultiSelectCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";
import type { Branding } from "@/lib/use-branding";

interface MultiSelectCardProps {
  question: PublicQuestion;
  branding: Branding;
  onAnswer: (value: number[]) => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Checkbox-style card for multi-select MCQ — unlike McqCard (click one,
// submit immediately, lock), the candidate can check/uncheck freely and
// must press Submit when ready, mirroring TextAnswerCard's select-then-
// confirm pattern rather than McqCard's click-and-lock one, since there's
// no single click that means "done" here.
export default function MultiSelectCard({ question, branding, onAnswer }: MultiSelectCardProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  function toggle(index: number) {
    if (submitted) return;
    setSelected((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  }

  function handleSubmit() {
    if (submitted || selected.length === 0) return;
    setSubmitted(true);
    onAnswer(selected);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-2 text-xl font-medium text-[#0F172A]">{question.text}</p>
      <p className="mb-6 text-sm font-medium text-[#64748B]">
        Select {question.correctCount ?? "the correct number of"} of {question.options.length} options
      </p>
      <div className="grid grid-cols-2 gap-4">
        {question.options.map((option, index) => {
          const isSelected = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={submitted}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                isSelected ? "" : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
              } ${submitted && !isSelected ? "opacity-40" : ""}`}
              style={
                isSelected
                  ? { borderColor: branding.primaryColour, backgroundColor: `${branding.primaryColour}1A` }
                  : undefined
              }
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                  isSelected ? "text-white" : "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                }`}
                style={isSelected ? { backgroundColor: branding.primaryColour } : undefined}
              >
                {isSelected ? "✓" : LETTERS[index]}
              </span>
              <span className="text-[#0F172A]">{option}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitted || selected.length === 0}
        className="mt-6 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-40"
      >
        {submitted ? "Submitted" : "Submit answer"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the exam page — import**

In `app/candidate/exam/page.tsx`, the imports currently read:

```typescript
import TextAnswerCard from "@/components/exam/TextAnswerCard";
```

Add immediately after it:

```typescript
import TextAnswerCard from "@/components/exam/TextAnswerCard";
import MultiSelectCard from "@/components/exam/MultiSelectCard";
```

- [ ] **Step 3: Broaden the value types**

`submitAnswer` currently reads:

```typescript
  const submitAnswer = useCallback(async (value: number | string | null) => {
```

Change to:

```typescript
  const submitAnswer = useCallback(async (value: number | number[] | string | null) => {
```

`handleAnswer` currently reads:

```typescript
  const handleAnswer = useCallback(async (value: number | string | null) => {
```

Change to:

```typescript
  const handleAnswer = useCallback(async (value: number | number[] | string | null) => {
```

- [ ] **Step 4: Add the render branch**

The MCQ/Image/True-False render branch currently reads:

```tsx
        {(question.type === QuestionType.MCQ ||
          question.type === QuestionType.IMAGE ||
          question.type === QuestionType.TRUE_FALSE) && (
          <McqCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
```

Add immediately after it:

```tsx
        {(question.type === QuestionType.MCQ ||
          question.type === QuestionType.IMAGE ||
          question.type === QuestionType.TRUE_FALSE) && (
          <McqCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.MULTI_SELECT && (
          <MultiSelectCard question={question} branding={branding} onAnswer={(v) => handleAnswer(v)} />
        )}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint components/exam/MultiSelectCard.tsx app/candidate/exam/page.tsx
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/exam/MultiSelectCard.tsx app/candidate/exam/page.tsx
git commit -m "feat(exam): add MultiSelectCard and wire it into the exam page"
```

---

### Task 7: Admin builder UI

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-2 (the API now accepts `correctOptions`).
- Produces: a working "Multi-select MCQ" tile in the question builder, a variable-length (2-8) options editor, a multi-toggle correct-answer picker, submit validation, and a list-item badge showing option/correct counts.

- [ ] **Step 1: Update the `Question` interface**

Currently reads (top of file):

```typescript
interface Question {
  id: string;
  type: "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer" | "true_false";
  text: string;
  imageUrl: string | null;
  options: unknown;
  correctOption: number | null;
  wordLimit: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}
```

Change to:

```typescript
interface Question {
  id: string;
  type: "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer" | "true_false" | "multi_select";
  text: string;
  imageUrl: string | null;
  options: unknown;
  correctOption: number | null;
  correctOptions: number[] | null;
  wordLimit: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}
```

- [ ] **Step 2: Add the type tile and options-count constant**

`QUESTION_TYPES` currently reads:

```typescript
const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (MCQ)" },
  { value: "true_false", label: "True / False" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
  { value: "short_answer", label: "Short Answer" },
  { value: "long_answer", label: "Long Answer" },
] as const;

const TRUE_FALSE_OPTIONS = ["True", "False"];
```

Change to:

```typescript
const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (MCQ)" },
  { value: "true_false", label: "True / False" },
  { value: "multi_select", label: "Multi-select MCQ" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
  { value: "short_answer", label: "Short Answer" },
  { value: "long_answer", label: "Long Answer" },
] as const;

const TRUE_FALSE_OPTIONS = ["True", "False"];
const MIN_MULTI_SELECT_OPTIONS = 2;
const MAX_MULTI_SELECT_OPTIONS = 8;
```

- [ ] **Step 3: Add state and derived flags**

The `qType` state currently reads:

```typescript
  const [qType, setQType] = useState<
    "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer" | "true_false"
  >("mcq");
```

Change to:

```typescript
  const [qType, setQType] = useState<
    "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer" | "true_false" | "multi_select"
  >("mcq");
```

Immediately after the existing state declarations (after `const [imageUploading, setImageUploading] = useState(false);`), add:

```typescript
  // Indices marked correct for a multi-select question — separate from
  // qCorrect (a single index) since multi-select needs a set, not one value.
  const [qMultiCorrect, setQMultiCorrect] = useState<number[]>([]);
```

The derived flags currently read:

```typescript
  const needsOptions = qType === "mcq" || qType === "image" || qType === "true_false";
  const isTrueFalse = qType === "true_false";
  const needsWordLimit = qType === "short_answer" || qType === "long_answer";
```

Change to:

```typescript
  const needsOptions = qType === "mcq" || qType === "image" || qType === "true_false" || qType === "multi_select";
  const isTrueFalse = qType === "true_false";
  const isMultiSelect = qType === "multi_select";
  const needsWordLimit = qType === "short_answer" || qType === "long_answer";
```

- [ ] **Step 4: Add add/remove/toggle helpers for multi-select options**

Immediately after the existing `setOption` function:

```typescript
  function setOption(index: number, value: string) {
    setQOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }
```

Add:

```typescript
  function addOption() {
    setQOptions((prev) => (prev.length >= MAX_MULTI_SELECT_OPTIONS ? prev : [...prev, ""]));
  }

  function removeOption(index: number) {
    setQOptions((prev) =>
      prev.length <= MIN_MULTI_SELECT_OPTIONS ? prev : prev.filter((_, i) => i !== index)
    );
    // Keep qMultiCorrect aligned with the shrunk array — drop the removed
    // index and shift every index after it down by one.
    setQMultiCorrect((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    );
  }

  function toggleMultiCorrect(index: number) {
    setQMultiCorrect((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  }
```

- [ ] **Step 5: Update validation and submit payload**

`handleAddQuestion` currently starts:

```typescript
  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (needsOptions && qOptions.some((o) => !o.trim())) {
      setAddError("All options must be filled in.");
      return;
    }
    if (needsWordLimit && (!qWordLimit.trim() || Number(qWordLimit) <= 0)) {
      setAddError("Word limit must be a positive number.");
      return;
    }
    setAdding(true);
```

Change to:

```typescript
  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (needsOptions && qOptions.some((o) => !o.trim())) {
      setAddError("All options must be filled in.");
      return;
    }
    if (isMultiSelect && (qOptions.length < MIN_MULTI_SELECT_OPTIONS || qOptions.length > MAX_MULTI_SELECT_OPTIONS)) {
      setAddError(`Multi-select questions must have between ${MIN_MULTI_SELECT_OPTIONS} and ${MAX_MULTI_SELECT_OPTIONS} options.`);
      return;
    }
    if (isMultiSelect && qMultiCorrect.length === 0) {
      setAddError("Mark at least one option as correct.");
      return;
    }
    if (needsWordLimit && (!qWordLimit.trim() || Number(qWordLimit) <= 0)) {
      setAddError("Word limit must be a positive number.");
      return;
    }
    setAdding(true);
```

The submit body currently reads:

```typescript
        body: JSON.stringify({
          type: qType,
          text: qText.trim(),
          imageUrl: qImageUrl.trim() || null,
          options: needsOptions ? qOptions : [],
          correctOption: needsOptions ? qCorrect : null,
          wordLimit: needsWordLimit ? Number(qWordLimit) : null,
          timeLimitSec: Number(qTime),
          basePoints: Number(qPoints),
          speedBonusMax: Number(qSpeedBonus),
        }),
```

Change to:

```typescript
        body: JSON.stringify({
          type: qType,
          text: qText.trim(),
          imageUrl: qImageUrl.trim() || null,
          options: needsOptions ? qOptions : [],
          correctOption: needsOptions && !isMultiSelect ? qCorrect : null,
          correctOptions: isMultiSelect ? qMultiCorrect : [],
          wordLimit: needsWordLimit ? Number(qWordLimit) : null,
          timeLimitSec: Number(qTime),
          basePoints: Number(qPoints),
          speedBonusMax: Number(qSpeedBonus),
        }),
```

The reset-after-submit block currently reads:

```typescript
      // Reset form — True/False keeps its fixed two-option shape; every other
      // type goes back to four blank slots.
      setQText("");
      setQImageUrl("");
      setQOptions(isTrueFalse ? TRUE_FALSE_OPTIONS : ["", "", "", ""]);
      setQCorrect(0);
```

Change to:

```typescript
      // Reset form — True/False keeps its fixed two-option shape; every other
      // type goes back to four blank slots.
      setQText("");
      setQImageUrl("");
      setQOptions(isTrueFalse ? TRUE_FALSE_OPTIONS : ["", "", "", ""]);
      setQCorrect(0);
      setQMultiCorrect([]);
```

- [ ] **Step 6: Update the type-selector click handler**

Currently reads:

```tsx
                    onClick={() => {
                      setQType(t.value as typeof qType);
                      if (t.value in DEFAULT_WORD_LIMIT) {
                        setQWordLimit(DEFAULT_WORD_LIMIT[t.value]);
                      }
                      // True/False has a fixed two-option shape, not the
                      // usual free-text list — set it going in, and restore
                      // four blank slots coming back out so a leftover
                      // ["True","False"] pair doesn't get submitted as an
                      // MCQ/Image question's options.
                      if (t.value === "true_false") {
                        setQOptions(TRUE_FALSE_OPTIONS);
                        setQCorrect(0);
                      } else if (isTrueFalse && (t.value === "mcq" || t.value === "image")) {
                        setQOptions(["", "", "", ""]);
                        setQCorrect(0);
                      }
                    }}
```

Change to:

```tsx
                    onClick={() => {
                      const nextType = t.value as typeof qType;
                      const prevType = qType;
                      setQType(nextType);
                      if (t.value in DEFAULT_WORD_LIMIT) {
                        setQWordLimit(DEFAULT_WORD_LIMIT[t.value]);
                      }
                      // Every option-bearing type keeps its own options shape
                      // (True/False: fixed 2; MCQ/Image: fixed 4;
                      // Multi-select: variable 2-8) — reset qOptions when
                      // crossing between shapes so a leftover array from one
                      // type's editor is never submitted under another type.
                      if (nextType === "true_false") {
                        setQOptions(TRUE_FALSE_OPTIONS);
                        setQCorrect(0);
                      } else if (
                        (nextType === "mcq" || nextType === "image") &&
                        prevType !== "mcq" && prevType !== "image"
                      ) {
                        setQOptions(["", "", "", ""]);
                        setQCorrect(0);
                      } else if (nextType === "multi_select" && prevType !== "multi_select") {
                        if (prevType === "true_false") setQOptions(["", "", "", ""]);
                        setQMultiCorrect([]);
                      }
                      if (prevType === "multi_select" && nextType !== "multi_select") {
                        setQMultiCorrect([]);
                      }
                    }}
```

- [ ] **Step 7: Restrict the existing options/correct-answer blocks to exclude multi-select, and add the multi-select variants**

The options-editing block currently reads:

```tsx
            {/* Options — MCQ and Image MCQ (True/False's options are fixed,
                not editable — its correct-answer picker below is enough) */}
            {needsOptions && !isTrueFalse && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Options
                </label>
                <div className="space-y-2">
                  {qOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F1F5F9] text-xs font-semibold text-[#64748B]">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        required
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
```

Change the condition and add the multi-select variant immediately after:

```tsx
            {/* Options — MCQ and Image MCQ (True/False's options are fixed;
                Multi-select gets its own variable-length editor below) */}
            {needsOptions && !isTrueFalse && !isMultiSelect && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Options
                </label>
                <div className="space-y-2">
                  {qOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F1F5F9] text-xs font-semibold text-[#64748B]">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        required
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Options — Multi-select MCQ (variable length, 2-8, with
                add/remove — every other option-bearing type has a fixed
                shape and doesn't need this) */}
            {isMultiSelect && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#0F172A]">
                    Options ({qOptions.length})
                  </label>
                  <button
                    type="button"
                    onClick={addOption}
                    disabled={qOptions.length >= MAX_MULTI_SELECT_OPTIONS}
                    className="text-xs font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-40"
                  >
                    + Add option
                  </button>
                </div>
                <div className="space-y-2">
                  {qOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F1F5F9] text-xs font-semibold text-[#64748B]">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        required
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        disabled={qOptions.length <= MIN_MULTI_SELECT_OPTIONS}
                        className="shrink-0 rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-30"
                        title="Remove option"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[#64748B]">
                  Between {MIN_MULTI_SELECT_OPTIONS} and {MAX_MULTI_SELECT_OPTIONS} options.
                </p>
              </div>
            )}
```

The MCQ/Image correct-answer selector currently reads:

```tsx
            {/* Correct answer selector — MCQ/Image use lettered buttons;
                True/False uses its own two-button variant below. */}
            {needsOptions && !isTrueFalse && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Correct answer
                </label>
                <div className="flex gap-2">
                  {qOptions.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQCorrect(i)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        qCorrect === i
                          ? "bg-[#6366F1] text-white"
                          : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1]"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                  ))}
                </div>
              </div>
            )}
```

Change the condition and add the multi-select variant immediately after (before the existing `{isTrueFalse && (...)}` block):

```tsx
            {/* Correct answer selector — MCQ/Image use lettered single-select
                buttons; True/False and Multi-select use their own variants
                below. */}
            {needsOptions && !isTrueFalse && !isMultiSelect && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Correct answer
                </label>
                <div className="flex gap-2">
                  {qOptions.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQCorrect(i)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        qCorrect === i
                          ? "bg-[#6366F1] text-white"
                          : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1]"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isMultiSelect && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Correct answers (select all that apply)
                </label>
                <div className="flex flex-wrap gap-2">
                  {qOptions.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleMultiCorrect(i)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        qMultiCorrect.includes(i)
                          ? "bg-[#6366F1] text-white"
                          : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1]"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                  ))}
                </div>
                {qMultiCorrect.length > 0 && (
                  <p className="mt-1.5 text-xs text-[#64748B]">
                    {qMultiCorrect.length} of {qOptions.length} marked correct.
                  </p>
                )}
              </div>
            )}
```

- [ ] **Step 8: Add the question-list badge**

The question-list type badge currently reads:

```tsx
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
                      {q.type}
                    </span>
```

Add immediately after it (still inside the same flex-wrap container, before the `negativeMarking &&` badge):

```tsx
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
                      {q.type}
                    </span>
                    {q.type === "multi_select" && Array.isArray(q.options) && (
                      <span className="text-xs text-[#94A3B8]">
                        {q.options.length} options, {(q.correctOptions ?? []).length} correct
                      </span>
                    )}
```

- [ ] **Step 9: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint "app/admin/campaigns/[id]/page.tsx"
```

Expected: no NEW errors (this file has 5 pre-existing lint errors unrelated to this change — confirmed via `git stash` comparison during the True/False work — don't be alarmed if they still show up; only check nothing new appears).

- [ ] **Step 10: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "feat(builder): multi-select MCQ type — variable options, multi-correct picker"
```

---

### Task 8: Full build verification

**Files:** none (verification only).

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full project build**

```bash
npm run build
```

Expected: build completes with no TypeScript errors and no new lint failures, same as after the True/False feature.

- [ ] **Step 2: Manual smoke-test checklist**

There is no automated test runner for this app (see Global Constraints), so this is the closest thing to end-to-end verification available. Run the dev server (`npm run dev`) and, against a test campaign:

1. In the builder, add a Multi-select MCQ question with 6 options, mark 2 correct. Confirm "+ Add option" disables at 8, the remove button disables at 2, and the question list shows "6 options, 2 correct".
2. As a candidate, reach that question in the exam. Confirm the header reads "Select 2 of 6 options", checking/unchecking works, and "Submit answer" stays disabled until at least one box is checked.
3. Submit the exact correct 2 options — confirm full points awarded (check the running score, or the results page after the campaign ends).
4. Submit a wrong combination (e.g. 1 correct + 1 wrong, or the correct 2 plus an extra) — confirm 0 points.
5. If the campaign has `antiCheatShuffleAnswers` on, confirm the above still scores correctly (shuffling shouldn't change which combination counts as correct).
6. If the campaign has negative marking on, confirm a wrong multi-select answer now actually applies the penalty (this was the bug fixed in Task 5).
7. Check the analytics page's option-frequency bars for this question — confirm they're non-zero and reflect real candidate picks, not all zero.

- [ ] **Step 3: Report results**

Note any checklist item that failed, with what was observed, before considering this plan complete.

---

## New env vars required

None — this feature needs no new environment variables or external services.
