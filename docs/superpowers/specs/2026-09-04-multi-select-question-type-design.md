# Multi-select MCQ question type

Date: 2026-09-04

## Summary

A new question type — **Multi-select MCQ** (`QuestionType.MULTI_SELECT`, value `"multi_select"`) — that generalizes the plain MCQ/Image types in two ways at once: the admin can configure any number of options from 2 to 8 (not fixed at 4), and can mark more than one of them as correct. A candidate must select exactly the correct set to earn points — no partial credit, matching the binary scoring model every other question type already uses.

This closes REMAINING_TASKS.txt items 35 (Multi-select MCQ) and 36 (configurable option count) with one type, since both are really the same underlying capability: options stop being a fixed-shape array with one correct index.

Reuses the existing option-based infrastructure (`isOptionBasedQuestionType`, answer-shuffling, analytics, negative marking) wherever it already generalizes correctly, and fixes two spots — found by hand-tracing during this design, not by inspection alone — that would otherwise silently misbehave for this type: the negative-marking eligibility check and the option-frequency analytics counter.

## Decisions made during brainstorming

- **Scoring:** exact-set match only. The candidate's selected set must equal the correct set precisely; anything else scores 0. No partial credit — keeps the existing binary `isCorrect` boolean that negative marking, P-value, and discrimination-index analytics all already depend on.
- **"N options, select M" indicator:** shown to both audiences. Candidates see "Select 2 of 6 options" on the exam question itself; admins see the option count and correct-answer count in the builder list and results page.
- **Revealing the correct count to candidates:** acceptable. Knowing "2 of 6" doesn't help guess *which* 2; matches how other assessment platforms present this question type.
- **Submit interaction:** checkboxes the candidate can freely check/uncheck, then an explicit "Submit answer" button — mirrors the existing Short/Long Answer select-then-confirm pattern, not the click-and-lock MCQ pattern (which structurally can't fit multi-select).
- **Option count range:** 2 to 8, enforced in the builder.

## Data model

Add to `Question` (`prisma/schema.prisma`), alongside `correctOption`:

```prisma
correctOptions Int[] @default([])
```

Used only by `MULTI_SELECT` questions. `correctOption` (singular, nullable Int) is untouched and keeps working exactly as today for MCQ/Image/True-False — no migration of existing data, no shared-column repurposing. A join-table design (`QuestionCorrectOption(questionId, optionIndex)`) was considered and rejected: it's unnecessary ceremony for what is just a short list of ints, and would require every scoring/analytics query that currently does a single-table read to join instead.

Add to `QuestionType` enum (both `types/index.ts` and `prisma/schema.prisma`):

```
MULTI_SELECT = "multi_select"
```

Applied via `prisma db push`, matching the True/False and every other recent schema change in this project (the pre-existing Neon migration-history drift makes `migrate dev` offer a destructive reset).

`isOptionBasedQuestionType()` (`types/index.ts`) gains `MULTI_SELECT` alongside `MCQ`/`IMAGE`/`TRUE_FALSE` — this is what makes shuffling, analytics, and negative-marking eligibility pick the new type up automatically at every one of the 8 call sites established when True/False was added, with no further per-site changes needed for those checks specifically.

## Types

`AnswerPayload.value` (`types/index.ts`) broadens from `number | string | null` to `number | number[] | string | null` — `number[]` is the candidate's selected display-indices for a multi-select answer.

`PublicQuestion` gains:

```typescript
correctCount: number | null;
```

Populated only for `MULTI_SELECT` (from `question.correctOptions.length`), `null` for every other type — same optionality pattern already used for `wordLimit`. This is the *only* correctness-relevant data ever sent to the candidate about a multi-select question's answer key: never the indices or their content, only the count, which is what the "Select 2 of 6" UI needs and was explicitly confirmed as an acceptable disclosure.

## Scoring

Computed in `app/api/assessment/submit-answer/route.ts`, same place `isCorrect` is already computed for every other type — `calculateScore()` (`lib/scoring.ts`) needs **no changes**, since it only ever consumes the already-computed boolean.

For `MULTI_SELECT`:

```typescript
const isCorrect =
  question.type === "multi_select"
    ? Array.isArray(canonicalValue) &&
      canonicalValue.length === question.correctOptions.length &&
      [...canonicalValue].sort((a, b) => a - b)
        .every((v, i) => v === [...question.correctOptions].sort((a, b) => a - b)[i])
    : question.correctOption !== null && canonicalValue === question.correctOption;
```

(Set-equality via sort-and-compare; the previous single-type branch keeps its exact current behavior.)

## Answer-shuffling integration

`shouldUnshuffle` already becomes `true` for `MULTI_SELECT` once `isOptionBasedQuestionType` includes it. The unshuffle step itself needs to handle an array instead of a single number:

```typescript
const canonicalValue =
  shouldUnshuffle && Array.isArray(value)
    ? value.map((displayIndex) =>
        translateDisplayIndexToCanonical(displayIndex, optionCount, seed)
      )
    : shouldUnshuffle && typeof value === "number"
      ? translateDisplayIndexToCanonical(value, optionCount, seed)
      : value;
```

Each selected display-index is translated independently — `translateDisplayIndexToCanonical` already exists and needs no changes, it's just called once per selected option instead of once per answer.

## Candidate UI

New component `components/exam/MultiSelectCard.tsx`, structured like `TextAnswerCard.tsx` (local selection state, a `submitted` lock, an explicit "Submit answer" button) rather than `McqCard.tsx` (which submits on first click and can't represent "still choosing"):

- Renders `question.options` as checkboxes (not radio-style buttons).
- Header line: `Select {question.correctCount} of {question.options.length} options`.
- "Submit answer" button disabled until at least one option is checked; enabled at any non-zero count (not locked to exactly `correctCount` — the candidate finding out they've hit the "right" count by the button unlocking would leak the answer key's shape more than the count alone does).
- On submit: `onAnswer(selectedIndices)` — an array of display-indices, sent through the same `handleAnswer` path every other type already uses in `app/candidate/exam/page.tsx`.

`app/candidate/exam/page.tsx` gets one more branch alongside the existing MCQ/Image/True-False and Short/Long Answer ones, rendering `MultiSelectCard` for `QuestionType.MULTI_SELECT`.

## Admin builder UI

In the "Add question" form (`app/admin/campaigns/[id]/page.tsx`):

- New tile in `QUESTION_TYPES`: `{ value: "multi_select", label: "Multi-select MCQ" }`.
- Options list becomes variable-length (2–8 rows) with "Add option" / remove-row controls, replacing the fixed 4-slot array used by MCQ/Image. (MCQ/Image keep their existing fixed-4 behavior unchanged — this variable-length list only renders for `multi_select`.)
- Correct-answer picker becomes toggleable (not single-select) buttons — click to mark/unmark each option as correct. At least 1 must be marked correct before the question can be saved.
- Validation on submit: every filled option row is required (same rule as today), option count within 2–8, at least one option marked correct.
- Question list display: shows "N options, M correct" next to each multi-select question (mirroring how the list already shows raw `q.type`).

## Generalizing two spots that would otherwise silently break (found during this design, not caught by `isOptionBasedQuestionType` alone)

Both of these were written when only single-answer types existed and implicitly assume `correctOption` is the only place "the right answer" lives — true for MCQ/Image/True-False, false for `MULTI_SELECT`, which stores its answer key in `correctOptions` instead.

**Negative marking** (`app/api/admin/campaigns/[id]/analytics/route.ts`, `app/api/admin/campaigns/[id]/results/route.ts`): the current check is

```typescript
if (r.answer !== null && r.score === 0 && isOptionBasedQuestionType(r.question.type)) {
  if (r.question.correctOption !== null && r.answer !== r.question.correctOption) {
    penalty += ...
  }
}
```

The inner `correctOption !== null` guard is redundant for existing types (if `score === 0` and the type is option-based and scored, it's already wrong by definition) and actively wrong for `MULTI_SELECT`, where `correctOption` is always `null` — it would silently suppress negative marking on every wrong multi-select answer. Fix: drop the inner check entirely. The outer condition (`answer !== null && score === 0 && isOptionBasedQuestionType(type)`) is already sufficient and type-agnostic — it doesn't need to know *what* correct means, only that the type is auto-scored and the response wasn't a skip.

**Option-frequency analytics** (`app/api/admin/campaigns/[id]/analytics/route.ts`):

```typescript
optionFrequency = (q.options as unknown[]).map((_, idx) =>
  qRes.filter(r => r.answer === idx).length
);
```

`r.answer === idx` is always `false` for an array answer, so every multi-select question would silently show zero frequency on every option. Fix:

```typescript
qRes.filter(r => Array.isArray(r.answer) ? r.answer.includes(idx) : r.answer === idx).length
```

## Explicitly out of scope

- Partial credit / per-option scoring — confirmed as the user's explicit choice; exact-set match only.
- Locking the Submit button to exactly `correctCount` selections — confirmed rejected, it would leak the answer key's shape.
- Answer-option shuffling gets no new code beyond the array-aware unshuffle above — the existing per-campaign `antiCheatShuffleAnswers` toggle applies to `MULTI_SELECT` automatically via `isOptionBasedQuestionType`.
- No changes to `McqCard.tsx` or `TextAnswerCard.tsx` — `MultiSelectCard.tsx` is a new, separate component.
- No retroactive migration of existing MCQ/Image questions into the new type — this is purely additive.
