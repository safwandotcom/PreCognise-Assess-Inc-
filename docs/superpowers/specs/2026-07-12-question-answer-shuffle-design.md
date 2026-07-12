# Question & Answer Shuffling — Design Spec

**Date:** 2026-07-12
**Status:** Approved
**Scope:** New anti-cheat feature — per-candidate question order and answer-option shuffling

---

## Overview

Two new per-campaign anti-cheat toggles, alongside the existing set (tab-switch detection, fullscreen enforcement, copy/paste block, etc.):

1. **Shuffle question order** — each candidate sees the campaign's questions in a different, individually-stable sequence, so no one can call out "the answer to question 3 is B" to someone else sitting the same exam.
2. **Shuffle answer options** — for MCQ and Image-MCQ questions only, each candidate sees the options in a different order, so position alone never reveals the answer.

Both default to `false` (off) and are configured per campaign, next to the platform's existing anti-cheat controls.

**Key architectural decision:** the shuffle is *computed*, not *stored*. There is no new "this candidate's question order" table or JSON column. Instead, a deterministic seeded shuffle is derived fresh on every request from `candidateId` (and `candidateId + questionId` for options). Same candidate, same campaign state → same personal order, every time, with zero extra database writes and zero migration risk for existing candidates mid-campaign.

---

## Data Model

`prisma/schema.prisma` — two new fields on `Campaign`, next to the existing anti-cheat booleans:

```prisma
model Campaign {
  // ...existing fields...
  antiCheatDevTools          Boolean        @default(true)
  antiCheatShuffleQuestions  Boolean        @default(false)
  antiCheatShuffleAnswers    Boolean        @default(false)
  // ...
}
```

New Prisma migration to add these two columns (both `NOT NULL DEFAULT false`, so existing campaigns are unaffected and behave exactly as they do today).

---

## `lib/shuffle.ts` (new)

A small, pure, dependency-free seeded shuffle utility — no crypto requirements, this is not a security boundary, just a way to get a stable-but-unpredictable-to-humans permutation.

```ts
// Deterministic PRNG (mulberry32) seeded from a string.
function seedFromString(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a permutation array `perm` of length n such that
 * perm[displayPosition] = originalIndex.
 * Same seed always produces the same permutation.
 */
export function seededPermutation(n: number, seed: string): number[] {
  const rand = mulberry32(seedFromString(seed));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** Reorders `items` for display according to a seeded permutation. */
export function applySeededShuffle<T>(items: T[], seed: string): T[] {
  const perm = seededPermutation(items.length, seed);
  return perm.map((originalIndex) => items[originalIndex]);
}
```

Unit-testable in isolation: same seed → same output; covers every index exactly once; different seeds → different (not necessarily, but practically always) orderings.

---

## Question Order Shuffle — `app/api/assessment/next-question/route.ts`

Current behavior: fetch all campaign questions ordered by `orderIndex`, find the first one not yet in the candidate's `Response` rows.

New behavior when `campaign.antiCheatShuffleQuestions` is true: reorder that same question list per-candidate before picking the first unanswered one.

```ts
const campaign = await prisma.campaign.findUnique({
  where: { id: candidate.campaignId },
  select: { completionMessage: true, antiCheatShuffleQuestions: true, antiCheatShuffleAnswers: true },
});

let orderedQuestions = await prisma.question.findMany({
  where: { campaignId: candidate.campaignId },
  orderBy: { orderIndex: "asc" },
});

if (campaign?.antiCheatShuffleQuestions) {
  orderedQuestions = applySeededShuffle(orderedQuestions, candidateId);
}

const next = orderedQuestions.find((q) => !answeredIds.includes(q.id));
```

`totalQuestions` and `answeredCount` are unaffected — they're just counts, independent of order.

---

## Answer Option Shuffle — delivery side (`next-question`)

For the chosen `next` question, when `campaign.antiCheatShuffleAnswers` is true and `next.type` is `mcq` or `image`:

```ts
const shouldShuffleOptions =
  campaign?.antiCheatShuffleAnswers && (next.type === "mcq" || next.type === "image");

const displayOptions = shouldShuffleOptions
  ? applySeededShuffle(next.options as (string | number)[], `${candidateId}:${next.id}`)
  : (next.options as (string | number)[]);
```

The seed combines `candidateId` and `questionId` so each question gets its own independent permutation per candidate — not the same rotation applied uniformly to every question. `correctOption` is never sent to the client (unchanged from today).

---

## Answer Option Shuffle — scoring side (`app/api/assessment/submit-answer/route.ts`)

The candidate submits `value` = the index they clicked *in their shuffled display*. To score correctly and to keep analytics meaningful, the server must:

1. Recompute the same permutation (same seed formula: `candidateId:questionId`)
2. Translate the submitted display-index back to the canonical index
3. Score against the canonical index
4. **Store the canonical index** in `Response.answer` — not the display index

```ts
const question = await prisma.question.findUnique({
  where: { id: questionId },
  include: { campaign: { select: { antiCheatShuffleAnswers: true } } },
});

const shouldUnshuffle =
  question.campaign.antiCheatShuffleAnswers && (question.type === "mcq" || question.type === "image");

let canonicalValue = value;
if (shouldUnshuffle && typeof value === "number") {
  const perm = seededPermutation((question.options as unknown[]).length, `${candidateId}:${questionId}`);
  canonicalValue = perm[value]; // perm[displayIndex] = canonicalIndex
}

const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
// ...store `canonicalValue` in Response.answer instead of the raw submitted `value`
```

**Why this matters:** because `Response.answer` always holds the canonical option index regardless of whether shuffling is on, every downstream analytics computation (P-value, discrimination index, option-frequency / "most popular wrong answer") continues to aggregate meaningfully across candidates — a display-only feature, invisible to scoring and reporting.

---

## Admin API — `app/api/admin/campaigns/[id]/route.ts`

Add the two new fields to the existing PATCH destructuring and conditional-update block, following the exact pattern already used for `antiCheatFullscreen` etc.:

```ts
const { /* ...existing fields..., */ antiCheatShuffleQuestions, antiCheatShuffleAnswers } = body;
// ...
...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
...(antiCheatShuffleAnswers !== undefined && { antiCheatShuffleAnswers }),
```

---

## Admin UI — `app/admin/campaigns/[id]/page.tsx`

Two new toggle rows in the existing Anti-Cheat settings panel, matching the current toggle switch component exactly (same `useState` + sync-on-load + include-in-save-payload pattern used for every other anti-cheat boolean on this page):

- **"Shuffle Question Order"** — helper text: *"Give each candidate a different question sequence, so no one can call out answers by question number."*
- **"Shuffle Answer Options"** — helper text: *"Randomize multiple-choice option order per candidate, so position never gives away the answer. Doesn't apply to rating or psychometric questions."*

No changes needed to `app/admin/campaigns/new/page.tsx` — anti-cheat settings are configured after creation on the campaign detail page, matching how every other anti-cheat toggle already works.

---

## Candidate-Facing Fix — `app/candidate/exam/page.tsx`

Unrelated bug uncovered while designing this feature: the progress ring currently receives `currentIndex={question.orderIndex}` — the question's fixed database position. Once question order can be shuffled, this would show a nonsensical progress number (e.g. "Question 8 of 10" on someone's actual first question).

Fix: use the candidate's own answered-count instead, which is correct whether or not shuffling is on:

```tsx
<QuestionProgress
  answered={progress.answered}
  total={progress.total}
  currentIndex={progress.answered}
/>
```

(`QuestionProgress`'s `currentIndex` prop is documented as "0-based index of the current question" — `progress.answered` is exactly that, since it counts questions completed before the current one.)

---

## Edge Cases

- **Toggling mid-campaign:** since nothing is persisted, flipping either switch takes effect on the candidate's very next `next-question` request. No backfill or migration needed. Recommended admin practice is still to set both before the campaign goes live, but nothing breaks either way.
- **Already-submitted responses:** untouched — they were scored and stored against whatever shuffle configuration existed at the moment of submission, which is the correct, immutable behavior for an audit trail.
- **Rating / Psychometric questions:** `antiCheatShuffleAnswers` has no effect on them regardless of the toggle — enforced by the explicit `type === "mcq" || type === "image"` check on both the delivery and scoring sides.
- **Double-answer guard:** unchanged — `@@unique([candidateId, questionId])` on `Response` still applies; shuffling only changes order/display, never the question identity.

---

## Testing Plan

1. **Unit — `lib/shuffle.ts`:** same seed always produces the same permutation; permutation of length `n` contains every index `0..n-1` exactly once; different seeds produce different permutations for the same `n`.
2. **Integration — question order:** two candidates in the same shuffle-enabled campaign receive different first questions (the scenario described in the original request); a single candidate polling `next-question` repeatedly (without answering) always gets the same next question.
3. **Integration — answer options:** a candidate who selects the actually-correct option, regardless of which position it was displayed in, is scored correct; `Response.answer` in the database always matches the canonical option index, never the display index.
4. **Regression — analytics:** with shuffle on, per-question P-value / discrimination index / option-frequency for a small synthetic campaign match what they'd be with shuffle off, given the same underlying (canonical) answers.
5. **Regression — progress UI:** candidate exam page shows correct "Question X of N" whether or not shuffling is enabled.
