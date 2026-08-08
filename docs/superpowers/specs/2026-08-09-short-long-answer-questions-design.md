# Short Answer & Long Answer question types

Date: 2026-08-09

## Summary

Two new question types alongside the existing MCQ / Psychometric / Rating / Image: **Short Answer** and **Long Answer**. Both let the admin build a free-text question with a word limit they choose while creating it. Unlike every existing type, these are not auto-scored — the candidate's text response sits ungraded until an admin manually assigns a score, and the candidate's result is held as "pending review" until that happens.

This also fixes an unrelated but related problem the user flagged while discussing this feature: the candidate-facing exam and result pages are hardcoded to a dark theme, disconnected from the organization branding system already used on the login/instructions/waiting-room pages. This work brings them in line.

## Data model

`prisma/schema.prisma`:

```prisma
enum QuestionType {
  mcq
  psychometric
  rating
  image
  short_answer   // new
  long_answer    // new
}

model Question {
  // ...existing fields unchanged...
  wordLimit  Int?   // new — required for short_answer/long_answer, unused for other types
}

model Response {
  // ...existing fields unchanged...
  needsGrading  Boolean    @default(false)  // new — true only for short_answer/long_answer responses
  gradedAt      DateTime?                   // new — null until an admin grades it
}
```

`Response.answer` is already an untyped `Json` column (today holds a number option-index or null); for these two types it will hold the candidate's submitted text string instead. No schema change needed for that.

`Response.score` stays `Int @default(0)` — no nullable score, no separate "pending" enum. A short/long-answer response is created with `score: 0, needsGrading: true, gradedAt: null` at submission time, and grading simply updates `score` and sets `gradedAt`. Because the existing results aggregation already computes `rawScore = sum(Response.score)` live at query time (not cached), grading a response automatically reflects in the next results fetch with no extra reaggregation step.

A candidate's result is **pending review** whenever any of their responses have `needsGrading && !gradedAt`. This is a derived flag, computed where needed — not stored.

Applied via `prisma db push`, per established project convention (this database has pre-existing drift outside its migration history).

`types/index.ts`: `QuestionType` enum gets `SHORT_ANSWER = "short_answer"`, `LONG_ANSWER = "long_answer"`. `PublicQuestion` gains `wordLimit: number | null`. `AnswerPayload.value` widens from `number | null` to `number | string | null`.

## Admin question builder UI

`app/admin/campaigns/[id]/page.tsx`, `QUESTION_TYPES`:

```ts
const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (MCQ)" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
  { value: "short_answer", label: "Short Answer" },   // new
  { value: "long_answer", label: "Long Answer" },     // new
] as const;
```

Still a flat button grid (now 6), consistent with the existing picker — no grouped/two-step category UI.

New conditional, alongside the existing `needsOptions`:
```ts
const needsWordLimit = qType === "short_answer" || qType === "long_answer";
```
When true: show a required "Word limit" number input (positive integer) instead of the Options list / correct-answer picker. Suggested placeholder defaults — 50 for Short Answer, 500 for Long Answer — but the admin can set any value; this is not a fixed system constant.

The existing psychometric/rating info banner ("This question type always awards full points...") gets a parallel banner for these two types: *"This question is graded manually by an admin after the candidate submits — it won't contribute to the score until reviewed."*

Shared fields (time limit, base points, speed bonus) are unchanged; `basePoints` becomes the ceiling an admin can award when grading.

Question list badges show "Short Answer" / "Long Answer" like the other types.

`app/api/admin/campaigns/[id]/questions/route.ts` (`POST`): accepts and persists `wordLimit` the same untyped way it already persists every other field (this route does no server-side type validation today; that's pre-existing and out of scope to change here).

## Candidate exam-taking UI

One shared component, `components/exam/TextAnswerCard.tsx`, parameterized by `variant: "short" | "long"` (short/long differ only in textarea size and default styling, not behavior — a single component avoids duplicating the word-limit logic). Wired into `app/candidate/exam/page.tsx`'s existing type-dispatch:

```tsx
{question.type === QuestionType.SHORT_ANSWER && (
  <TextAnswerCard variant="short" question={question} onAnswer={(v) => handleAnswer(v)} />
)}
{question.type === QuestionType.LONG_ANSWER && (
  <TextAnswerCard variant="long" question={question} onAnswer={(v) => handleAnswer(v)} />
)}
```

Behavior:
- Live word counter, e.g. `"42 / 50 words"`, updating on every keystroke.
- **Hard cap enforcement**: once word count reaches `question.wordLimit`, further word-adding keystrokes are blocked — the candidate can still edit/delete within existing text, just can't add new words past the cap. Counter shifts to a warning color as the limit approaches.
- No correctness feedback (there isn't one) — a submit/next control like the other cards.
- `onAnswer` submits the trimmed string as the answer value.

## Grading workflow

No per-candidate detail view exists today (the results page is a flat sortable table). This adds one:

- Clicking a row in `app/admin/campaigns/[id]/results/page.tsx` navigates to a new `app/admin/campaigns/[id]/results/[candidateId]/page.tsx`.
- That page shows: candidate summary header (name, status, score, pending-review badge if applicable), and a per-question breakdown. For `short_answer`/`long_answer` entries: the candidate's submitted text, a numeric score input (0–`basePoints`), and a "Save grade" button.
- New endpoint `PATCH /api/admin/responses/[id]/grade` — body `{ score }`, validates `0 <= score <= question.basePoints`, sets `score`, `gradedAt: new Date()`.
- No separate campaign-wide grading queue page — grading is scoped per-candidate, per the chosen approach.

`results/page.tsx` gets one addition: a "Pending review" badge/status for candidates with any `needsGrading && !gradedAt` response, shown alongside the existing status badges (`REGISTERED`/`JOINED`/`ACTIVE`/`COMPLETED`/`DISQUALIFIED`).

## Candidate's own result page

Correction found while writing the implementation plan: `app/candidate/result/page.tsx` does not show a score today, under any circumstances — it only ever shows a generic "Assessment Complete" message (the admin's custom `completionMessage`, or a default), plus the question count. No code change is needed here to satisfy "candidate sees a generic message, not a score, while review is pending" — that's already the page's only behavior, for every campaign, whether or not it has Short/Long Answer questions. This section is retained for the record; it produces no task in the implementation plan.

## Branding/theming reskin (exam + result pages)

The candidate flow already has a working, proven branding mechanism — `useBranding()` (`lib/use-branding.ts`) reading `OrgBranding`/`Campaign.bgColor`/`primaryColour` — consumed today by `login`, `instructions`, `waiting-room`, and `forgot-password`. Only `app/candidate/exam/page.tsx` and `app/candidate/result/page.tsx` bypass it, hardcoded to a dark palette (`bg-gray-900`, `text-white`, `bg-gray-800`, etc.) independent of the org's actual branding. This work wires those two pages, and the four answer-card components, into the same hook already in use elsewhere — no new branding infrastructure.

- `app/candidate/exam/page.tsx`: main container and sticky header switch from `bg-gray-900`/`text-white` to `branding.bgColor` (default light `#F8FAFC`) with dark text, matching the login/instructions look.
- `McqCard`, `PsychometricCard`, `RatingCard`, new `TextAnswerCard`, and `QuestionProgress`: switch from hardcoded `bg-gray-800`/`text-white`/`text-gray-400`/etc. to light surfaces, using `branding.primaryColour` for accents (selected option border, progress fill) — same role `primaryColour` already plays in the login page's gradient.
- `TimerRing.tsx`: track color changes from hardcoded `#1f2937` to a light neutral; progress arc uses `branding.primaryColour`.
- `app/candidate/result/page.tsx`: same light/branded reskin, plus the pending-review message above.

**Explicitly excluded from theming**: the full-screen violation/lockout overlays (fullscreen-exit, camera-blocked, multi-display, screenshot-blocked warnings) stay solid black/dark exactly as they are today. These are deliberate hard-stop states, not regular content, and the user confirmed they should not adopt branding colors.

Net effect: the entire candidate journey (login → instructions → waiting room → exam → result) consistently reflects the organization's branding, with anti-cheat lockout overlays remaining visually distinct by design.

## Explicitly out of scope

- No AI-assisted or auto-grading (e.g. keyword/LLM scoring) — grading is manual-only, admin-assigned points.
- No campaign-wide grading queue page — grading happens per-candidate from the results detail view.
- No pass/fail-only grading mode — score is always a point value from 0 to the question's `basePoints`.
- No soft/warning-only word limit mode — the limit is always a hard cap on candidate input.
- No theming of the anti-cheat violation/lockout overlays — they stay black/dark, confirmed explicitly.
- No server-side type/field validation added to the question-creation API beyond what's needed to persist `wordLimit` — the route's existing lack of validation is pre-existing and unrelated to this feature.
- No changes to how MCQ/Psychometric/Rating/Image questions are scored — `lib/scoring.ts`'s existing branches are untouched; a new branch is added only for the two new types (score stays 0 until graded).
