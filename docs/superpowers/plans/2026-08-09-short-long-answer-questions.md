# Short Answer & Long Answer Question Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can build "Short Answer" and "Long Answer" questions with an admin-chosen word limit; candidates answer in a hard-capped textarea; responses sit ungraded until an admin manually assigns a score (0–basePoints) from a new per-candidate grading view, and the results table flags candidates with ungraded responses as "Pending review."

**Architecture:** Extends the existing `QuestionType` enum and the single flat question-type picker already used for `mcq`/`psychometric`/`rating`/`image` in `app/admin/campaigns/[id]/page.tsx` — no new UI paradigm. Candidate-side follows the exact type-dispatch pattern in `app/candidate/exam/page.tsx` (`McqCard`/`PsychometricCard`/`RatingCard` → add `TextAnswerCard`). Grading is manual-only: `Response` gains `needsGrading`/`gradedAt` fields so a short/long-answer response is created with `score: 0` and sits flagged until an admin PATCHes a score through a new endpoint from a new per-candidate detail page (a page that doesn't exist today — the results table currently has no per-row drill-down).

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Prisma + Postgres (applied via `prisma db push`, not `migrate dev` — see Global Constraints), Tailwind CSS. No new dependency.

## Global Constraints

- No unit/integration test framework exists in this Next.js app (no jest/vitest config, no `*.test.*` files). Every task's verification step is `npx tsc --noEmit -p tsconfig.json` + `npx eslint <changed files>`, not automated tests.
- **Never run `npx prisma migrate dev` against this database.** It has pre-existing schema drift outside its migration history, and `migrate dev` will detect that drift and offer a destructive `prisma migrate reset` that drops all data. Use `npx prisma db push`.
- Run `npx prisma`, `npx tsc`, `npx eslint`, and `npm run dev` via the **PowerShell tool, not Bash** — Bash's `node`/`npx` are not on PATH in this environment but PowerShell's are.
- Grading is manual-only, points-based (0 to the question's `basePoints`) — no AI/keyword auto-grading, no pass/fail-only mode. This is an explicit, confirmed decision — do not add auto-scoring for these two types.
- Word limits are always a hard cap enforced client-side in the answer textarea — never a soft warning-only mode.
- Follow existing admin-portal Tailwind color tokens exactly: `#6366F1` (primary/indigo), `#0F172A` (heading text), `#64748B` (secondary text), `#94A3B8` (tertiary/placeholder text), `#E2E8F0` (borders), `#F8FAFC` (light surface/background), `#F1F5F9` (subtle fill). Do not introduce new colors.
- Dev server: `npm run dev`. No dev server or browser is available to the implementer subagent — manual-verification steps in this plan are written for whoever performs them later with real dev-server + browser access, not for the implementer to attempt itself. Note this in your task report and move on.
- This plan is independent of the companion plan `docs/superpowers/plans/2026-08-09-candidate-branding-reskin.md`. **Recommend executing this plan first** — that plan's task list includes reskinning `components/exam/TextAnswerCard.tsx`, which this plan creates; if the branding plan runs first, it will simply have nothing to reskin for that one file yet (not an error, just a missed file until this plan runs).

---

### Task 1: Prisma schema — new question types, word limit, manual-grading fields

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `QuestionType.short_answer`, `QuestionType.long_answer` (new enum values); `Question.wordLimit: number | null`; `Response.needsGrading: boolean`, `Response.gradedAt: Date | null`. Every later task depends on this having run.

- [ ] **Step 1: Add the two new enum values**

Replace:

```prisma
enum QuestionType {
  mcq
  psychometric
  rating
  image
}
```

with:

```prisma
enum QuestionType {
  mcq
  psychometric
  rating
  image
  short_answer
  long_answer
}
```

- [ ] **Step 2: Add `wordLimit` to `Question`**

Replace:

```prisma
model Question {
  id            String       @id @default(cuid())
  type          QuestionType
  text          String
  imageUrl      String?
  options       Json
  correctOption Int?
  timeLimitSec  Int
  basePoints    Int
  speedBonusMax Int          @default(0)
  orderIndex    Int
  campaignId    String
  campaign      Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responses     Response[]
}
```

with:

```prisma
model Question {
  id            String       @id @default(cuid())
  type          QuestionType
  text          String
  imageUrl      String?
  options       Json
  correctOption Int?
  wordLimit     Int?
  timeLimitSec  Int
  basePoints    Int
  speedBonusMax Int          @default(0)
  orderIndex    Int
  campaignId    String
  campaign      Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responses     Response[]
}
```

`wordLimit` is only ever set for `short_answer`/`long_answer` questions — `null` for every other type, same convention as `correctOption` being `null` for `psychometric`/`rating`.

- [ ] **Step 3: Add `needsGrading` and `gradedAt` to `Response`**

Replace:

```prisma
model Response {
  id             String   @id @default(cuid())
  answer         Json
  score          Int      @default(0)
  responseTimeMs Int
  createdAt      DateTime @default(now())

  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([candidateId, questionId])
}
```

with:

```prisma
model Response {
  id             String    @id @default(cuid())
  answer         Json
  score          Int       @default(0)
  needsGrading   Boolean   @default(false)
  gradedAt       DateTime?
  responseTimeMs Int
  createdAt      DateTime  @default(now())

  candidateId String
  candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([candidateId, questionId])
}
```

`needsGrading` is `true` only for responses to `short_answer`/`long_answer` questions (set at creation time in Task 7). `score` stays `0` on every such row until an admin grades it (Task 10) and sets `gradedAt`. Every other question type's responses keep `needsGrading: false`, `gradedAt: null` forever — they're auto-scored at submission exactly as today.

- [ ] **Step 4: Format and apply**

Run (PowerShell): `npx prisma format` — re-aligns column spacing.

Run (PowerShell): `npx prisma db push`

Expected output: `Your database is now in sync with your Prisma schema.` followed by `Generated Prisma Client`. **If this instead shows drift detection or offers `prisma migrate reset`, STOP — do not proceed, do not confirm any reset prompt.** Report BLOCKED with the exact output.

- [ ] **Step 5: Verify**

Run: `npx prisma validate` — expect `The schema at prisma\schema.prisma is valid 🚀`

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors (confirms the regenerated Prisma client's `Question`/`Response` types include the new fields, and `QuestionType` includes the two new values).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add short_answer/long_answer question types, wordLimit, and manual-grading fields"
```

---

### Task 2: Shared TypeScript types

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: `QuestionType` enum, `Question`/`Response` Prisma types (Task 1).
- Produces: `QuestionType.SHORT_ANSWER`, `QuestionType.LONG_ANSWER`; `PublicQuestion.wordLimit: number | null`; `AnswerPayload.value: number | string | null`. Consumed by every remaining task in this plan.

- [ ] **Step 1: Add the two enum values**

Replace:

```ts
export enum QuestionType {
  MCQ = "mcq",
  PSYCHOMETRIC = "psychometric",
  RATING = "rating",
  IMAGE = "image",
}
```

with:

```ts
export enum QuestionType {
  MCQ = "mcq",
  PSYCHOMETRIC = "psychometric",
  RATING = "rating",
  IMAGE = "image",
  SHORT_ANSWER = "short_answer",
  LONG_ANSWER = "long_answer",
}
```

- [ ] **Step 2: Add `wordLimit` to `PublicQuestion`, widen `AnswerPayload.value`**

Replace:

```ts
// Sanitized question shape sent to the candidate client.
// correctOption must never appear here.
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: (string | number)[];
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}

// What the candidate's client sends to submit-answer.
// value is null when the timer expired and the question was skipped.
export interface AnswerPayload {
  questionId: string;
  value: number | null;
  responseTimeMs: number;
}
```

with:

```ts
// Sanitized question shape sent to the candidate client.
// correctOption must never appear here.
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

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors will appear in files that assume `AnswerPayload.value`/answer-card `onAnswer` callbacks are `number | null` — these are exactly the files fixed by Tasks 3, 7, 8, 9. It's expected and fine for this step's `tsc` run to show those downstream errors; just confirm there are no errors *inside this file* (`types/index.ts` itself has no type errors).

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): add short_answer/long_answer QuestionType and widen AnswerPayload.value"
```

---

### Task 3: Scoring — short/long answer always scores 0 at submission

**Files:**
- Modify: `lib/scoring.ts`

**Interfaces:**
- Consumes: `QuestionType.SHORT_ANSWER`, `QuestionType.LONG_ANSWER` (Task 2).
- Produces: `calculateScore(...)` returns `0` for these two types, unconditionally. Consumed by Task 7 (`submit-answer` route) — the real score is assigned later via Task 10's grading endpoint, never at submission time.

- [ ] **Step 1: Add the new branch**

Replace:

```ts
export function calculateScore(
  isCorrect: boolean,
  questionType: QuestionType,
  basePoints: number,
  speedBonusMax: number,
  responseTimeMs: number,
  timeLimitSec: number
): number {
  if (
    questionType === QuestionType.PSYCHOMETRIC ||
    questionType === QuestionType.RATING
  ) {
    return basePoints;
  }

  if (!isCorrect) {
    return 0;
  }
```

with:

```ts
export function calculateScore(
  isCorrect: boolean,
  questionType: QuestionType,
  basePoints: number,
  speedBonusMax: number,
  responseTimeMs: number,
  timeLimitSec: number
): number {
  if (
    questionType === QuestionType.PSYCHOMETRIC ||
    questionType === QuestionType.RATING
  ) {
    return basePoints;
  }

  if (
    questionType === QuestionType.SHORT_ANSWER ||
    questionType === QuestionType.LONG_ANSWER
  ) {
    // Manually graded later via PATCH /api/admin/responses/[id]/grade —
    // never auto-scored at submission time.
    return 0;
  }

  if (!isCorrect) {
    return 0;
  }
```

Also update the function's doc comment — replace:

```ts
/**
 * Scores a single candidate response.
 *
 * - psychometric / rating: no "correct" answer — always award full basePoints
 * - mcq / image: scored against correctOption
 *     correct -> basePoints + speed bonus (faster = more bonus, capped at speedBonusMax)
 *     wrong   -> 0
 */
```

with:

```ts
/**
 * Scores a single candidate response.
 *
 * - psychometric / rating: no "correct" answer — always award full basePoints
 * - short_answer / long_answer: always 0 at submission time — graded manually
 *     later via PATCH /api/admin/responses/[id]/grade
 * - mcq / image: scored against correctOption
 *     correct -> basePoints + speed bonus (faster = more bonus, capped at speedBonusMax)
 *     wrong   -> 0
 */
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `lib/scoring.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/scoring.ts
git commit -m "feat(scoring): short_answer/long_answer always score 0 pending manual grading"
```

---

### Task 4: Question creation API — persist `wordLimit`

**Files:**
- Modify: `app/api/admin/campaigns/[id]/questions/route.ts`

**Interfaces:**
- Consumes: `Question.wordLimit` (Task 1).
- Produces: `POST /api/admin/campaigns/[id]/questions` accepts and persists an optional `wordLimit` in its JSON body. Consumed by Task 5 (admin question builder UI's save payload).

- [ ] **Step 1: Destructure and persist `wordLimit`**

Replace:

```ts
  const body = await req.json();
  const { type, text, imageUrl, options, correctOption, timeLimitSec, basePoints, speedBonusMax } = body;

  const count = await prisma.question.count({ where: { campaignId: id } });
  const question = await prisma.question.create({
    data: {
      type,
      text,
      imageUrl: imageUrl ?? null,
      options,
      correctOption: correctOption ?? null,
      timeLimitSec,
      basePoints,
      speedBonusMax: speedBonusMax ?? 0,
      orderIndex: count,
      campaignId: id,
    },
  });
```

with:

```ts
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

This route does no server-side type validation today (trusts whatever the client sends for every field) — that's pre-existing and out of scope to change here; `wordLimit` is persisted the same untyped way as every other field.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/campaigns/[id]/questions/route.ts"
git commit -m "feat(api): accept and persist wordLimit on question creation"
```

---

### Task 5: Admin question builder UI — Short Answer / Long Answer picker

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/campaigns/[id]/questions` accepting `wordLimit` (Task 4).
- Produces: nothing consumed by later tasks in this plan — leaf admin-UI piece (other than being the thing that creates the data Tasks 6+ read).

- [ ] **Step 1: Widen the local `Question` interface and add `wordLimit`**

Replace:

```ts
interface Question {
  id: string;
  type: "mcq" | "psychometric" | "rating" | "image";
  text: string;
  imageUrl: string | null;
  options: unknown;
  correctOption: number | null;
  timeLimitSec: number;
  basePoints: number;
  speedBonusMax: number;
  orderIndex: number;
}
```

with:

```ts
interface Question {
  id: string;
  type: "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer";
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

- [ ] **Step 2: Add the two picker entries**

Replace:

```ts
const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (MCQ)" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
] as const;
```

with:

```ts
const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (MCQ)" },
  { value: "psychometric", label: "Psychometric" },
  { value: "rating", label: "Rating" },
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
  { value: "short_answer", label: "Short Answer" },
  { value: "long_answer", label: "Long Answer" },
] as const;

// Suggested defaults shown when the admin picks one of these types —
// editable, not enforced. Short answers default to a tight limit; long
// answers to a much larger one.
const DEFAULT_WORD_LIMIT: Record<string, string> = {
  short_answer: "50",
  long_answer: "500",
};
```

- [ ] **Step 3: Widen `qType` state and add `qWordLimit` state**

Replace:

```ts
  // Add form state
  const [qType, setQType] = useState<
    "mcq" | "psychometric" | "rating" | "image"
  >("mcq");
  const [qText, setQText] = useState("");
  const [qImageUrl, setQImageUrl] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState<number>(0);
  const [qTime, setQTime] = useState("60");
  const [qPoints, setQPoints] = useState("10");
  const [qSpeedBonus, setQSpeedBonus] = useState("0");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [imageUploading, setImageUploading] = useState(false);

  const needsOptions = qType === "mcq" || qType === "image";
```

with:

```ts
  // Add form state
  const [qType, setQType] = useState<
    "mcq" | "psychometric" | "rating" | "image" | "short_answer" | "long_answer"
  >("mcq");
  const [qText, setQText] = useState("");
  const [qImageUrl, setQImageUrl] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState<number>(0);
  const [qWordLimit, setQWordLimit] = useState("50");
  const [qTime, setQTime] = useState("60");
  const [qPoints, setQPoints] = useState("10");
  const [qSpeedBonus, setQSpeedBonus] = useState("0");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [imageUploading, setImageUploading] = useState(false);

  const needsOptions = qType === "mcq" || qType === "image";
  const needsWordLimit = qType === "short_answer" || qType === "long_answer";
```

- [ ] **Step 4: Set a sensible word-limit default when the type button is clicked**

Replace:

```tsx
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setQType(t.value as typeof qType)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      qType === t.value
                        ? "border-[#6366F1] bg-[#6366F1] text-white"
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
```

with:

```tsx
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setQType(t.value as typeof qType);
                      if (t.value in DEFAULT_WORD_LIMIT) {
                        setQWordLimit(DEFAULT_WORD_LIMIT[t.value]);
                      }
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      qType === t.value
                        ? "border-[#6366F1] bg-[#6366F1] text-white"
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
```

- [ ] **Step 5: Add the Word limit field and the manual-grading banner**

Replace:

```tsx
            {(qType === "psychometric" || qType === "rating") && (
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question type always awards full points, no matter what the candidate answers — there&apos;s no wrong answer here.
              </p>
            )}
```

with:

```tsx
            {needsWordLimit && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Word limit
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={qWordLimit}
                  onChange={(e) => setQWordLimit(e.target.value)}
                  className="w-full max-w-[160px] rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Maximum number of words the candidate can type for this answer. They cannot type past this limit.
                </p>
              </div>
            )}

            {(qType === "psychometric" || qType === "rating") && (
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question type always awards full points, no matter what the candidate answers — there&apos;s no wrong answer here.
              </p>
            )}

            {needsWordLimit && (
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question is graded manually by an admin after the candidate submits — it won&apos;t contribute to the score until reviewed.
              </p>
            )}
```

- [ ] **Step 6: Validate and submit `wordLimit`, reset it after adding**

Replace:

```ts
  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (needsOptions && qOptions.some((o) => !o.trim())) {
      setAddError("All options must be filled in.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: qType,
          text: qText.trim(),
          imageUrl: qImageUrl.trim() || null,
          options: needsOptions ? qOptions : [],
          correctOption: needsOptions ? qCorrect : null,
          timeLimitSec: Number(qTime),
          basePoints: Number(qPoints),
          speedBonusMax: Number(qSpeedBonus),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setAddError(d.error ?? "Failed to add question");
        return;
      }
      // Reset form
      setQText("");
      setQImageUrl("");
      setQOptions(["", "", "", ""]);
      setQCorrect(0);
      setQTime("60");
      setQPoints("10");
      setQSpeedBonus("0");
      setImageUploading(false);
      setShowAdd(false);
      onChanged();
    } finally {
      setAdding(false);
    }
  }
```

with:

```ts
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
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      });
      if (!res.ok) {
        const d = await res.json();
        setAddError(d.error ?? "Failed to add question");
        return;
      }
      // Reset form
      setQText("");
      setQImageUrl("");
      setQOptions(["", "", "", ""]);
      setQCorrect(0);
      setQWordLimit("50");
      setQTime("60");
      setQPoints("10");
      setQSpeedBonus("0");
      setImageUploading(false);
      setShowAdd(false);
      onChanged();
    } finally {
      setAdding(false);
    }
  }
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint "app/admin/campaigns/[id]/page.tsx"`
Expected: no new errors (this file has pre-existing, unrelated errors confirmed outside this session's diffs — not your concern, do not fix them).

- [ ] **Step 8: Manually verify in the browser** (deferred if unavailable — note in report)

1. Open any campaign's Questions tab, click "Add question". Expected: 6 type buttons now, including "Short Answer" and "Long Answer".
2. Click "Short Answer". Expected: Options/Correct-answer fields disappear, a "Word limit" field appears pre-filled with `50`, and the manual-grading banner appears below it.
3. Click "Long Answer". Expected: word limit field updates to `500`.
4. Fill in question text, submit. Expected: question is created and appears in the list with a `short_answer`/`long_answer` badge.
5. Try submitting with the word limit field cleared to `0` or empty. Expected: inline error "Word limit must be a positive number."

- [ ] **Step 9: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "feat(admin): add Short Answer and Long Answer to the question type picker"
```

---

### Task 6: `next-question` route — include `wordLimit` in the candidate-facing question

**Files:**
- Modify: `app/api/assessment/next-question/route.ts`

**Interfaces:**
- Consumes: `Question.wordLimit` (Task 1), `PublicQuestion.wordLimit` (Task 2).
- Produces: `GET /api/assessment/next-question`'s `question.wordLimit` field. Consumed by Task 8 (`TextAnswerCard`) via Task 9's exam page wiring.

- [ ] **Step 1: Add `wordLimit` to the constructed `PublicQuestion`**

Replace:

```ts
    const question: PublicQuestion = {
        id: next.id,
        type: next.type as unknown as QuestionType,
        text: next.text,
        imageUrl: next.imageUrl,
        options: displayOptions,
        timeLimitSec: next.timeLimitSec,
        basePoints: next.basePoints,
        // Respect global speed bonus toggle — zero it out if disabled
        speedBonusMax: settings.speedBonusEnabled ? next.speedBonusMax : 0,
        orderIndex: candidate.campaign?.antiCheatShuffleQuestions ? -1 : next.orderIndex,
    };
```

with:

```ts
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/assessment/next-question/route.ts"
git commit -m "feat(api): include wordLimit in candidate-facing question payload"
```

---

### Task 7: `submit-answer` route — accept text answers, flag for manual grading

**Files:**
- Modify: `app/api/assessment/submit-answer/route.ts`

**Interfaces:**
- Consumes: `AnswerPayload.value: number | string | null` (Task 2), `calculateScore` returning 0 for these types (Task 3), `Response.needsGrading` (Task 1).
- Produces: `POST /api/assessment/submit-answer` accepts a string `value` and creates a `Response` row with `needsGrading: true` and `answer` holding the raw text. Nothing else consumes this — it's the write path.

- [ ] **Step 1: Compute `needsGrading` and persist it**

Replace:

```ts
  const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
  const scoreEarned = calculateScore(
    isCorrect,
    question.type as unknown as QuestionType,
    question.basePoints,
    effectiveSpeedBonusMax,
    responseTimeMs,
    question.timeLimitSec
  );

  await prisma.response.create({
    data: {
      candidateId,
      questionId,
      answer: canonicalValue === null || canonicalValue === undefined ? Prisma.JsonNull : canonicalValue,
      score: scoreEarned,
      responseTimeMs,
    },
  });
```

with:

```ts
  const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
  const scoreEarned = calculateScore(
    isCorrect,
    question.type as unknown as QuestionType,
    question.basePoints,
    effectiveSpeedBonusMax,
    responseTimeMs,
    question.timeLimitSec
  );

  // short_answer/long_answer responses are never auto-scored — they sit
  // flagged until an admin grades them via PATCH /api/admin/responses/[id]/grade
  const needsGrading =
    question.type === "short_answer" || question.type === "long_answer";

  await prisma.response.create({
    data: {
      candidateId,
      questionId,
      answer: canonicalValue === null || canonicalValue === undefined ? Prisma.JsonNull : canonicalValue,
      score: scoreEarned,
      needsGrading,
      responseTimeMs,
    },
  });
```

Note: `canonicalValue` can now be a `string` (for `short_answer`/`long_answer`) since `value`'s type widened in Task 2 — no code change needed for that here, since `canonicalValue`'s existing derivation (`shouldUnshuffle && typeof value === "number" ? ... : value`) already passes a non-number `value` through unchanged, and Prisma's `Json` field accepts a string directly.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/assessment/submit-answer/route.ts"
git commit -m "feat(api): accept text answers and flag short/long-answer responses for manual grading"
```

---

### Task 8: `TextAnswerCard` component — candidate-facing short/long answer input

**Files:**
- Create: `components/exam/TextAnswerCard.tsx`

**Interfaces:**
- Consumes: `PublicQuestion` (with `wordLimit`, Task 2/6).
- Produces: `TextAnswerCard({ question, variant, onAnswer })` React component, `variant: "short" | "long"`, `onAnswer: (value: string) => void`. Consumed by Task 9 (exam page wiring).

- [ ] **Step 1: Create the component**

Styled identically to the existing dark-themed cards (`McqCard`, `PsychometricCard`) — this matches today's candidate exam palette. (A separate, independent plan — `docs/superpowers/plans/2026-08-09-candidate-branding-reskin.md` — reskins every answer card, including this one, to the branding system; this task intentionally matches the *current* convention so that plan has one consistent surface to update.)

```tsx
"use client";

import { useState } from "react";
import { PublicQuestion } from "@/types";

interface TextAnswerCardProps {
  question: PublicQuestion;
  variant: "short" | "long";
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
      <p className="mb-6 text-xl font-medium text-white">{question.text}</p>
      <textarea
        rows={variant === "short" ? 3 : 10}
        value={text}
        onChange={handleChange}
        disabled={submitted}
        placeholder={variant === "short" ? "Type your short answer…" : "Type your long answer…"}
        className="w-full rounded-xl border border-gray-700 bg-gray-800 p-4 text-gray-100 placeholder-gray-500 outline-none focus:border-gray-500 disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs font-medium ${atLimit ? "text-amber-400" : "text-gray-400"}`}>
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

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint components/exam/TextAnswerCard.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/TextAnswerCard.tsx
git commit -m "feat(exam): add TextAnswerCard with hard word-limit enforcement"
```

---

### Task 9: Exam page — wire up Short Answer / Long Answer

**Files:**
- Modify: `app/candidate/exam/page.tsx`

**Interfaces:**
- Consumes: `TextAnswerCard` (Task 8), `QuestionType.SHORT_ANSWER`/`LONG_ANSWER` (Task 2), `AnswerPayload.value: number | string | null` (Task 2).
- Produces: nothing consumed elsewhere in this plan — final candidate-side integration point.

- [ ] **Step 1: Import `TextAnswerCard`**

Replace:

```tsx
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";
```

with:

```tsx
import TimerRing from "@/components/exam/TimerRing";
import McqCard from "@/components/exam/McqCard";
import PsychometricCard from "@/components/exam/PsychometricCard";
import RatingCard from "@/components/exam/RatingCard";
import TextAnswerCard from "@/components/exam/TextAnswerCard";
```

- [ ] **Step 2: Widen `submitAnswer` and `handleAnswer` to accept string values**

Replace:

```tsx
  const submitAnswer = useCallback(async (value: number | null) => {
```

with:

```tsx
  const submitAnswer = useCallback(async (value: number | string | null) => {
```

Replace:

```tsx
  const handleAnswer = useCallback(async (value: number | null) => {
```

with:

```tsx
  const handleAnswer = useCallback(async (value: number | string | null) => {
```

- [ ] **Step 3: Add the two new render branches**

Replace:

```tsx
        {(question.type === QuestionType.MCQ || question.type === QuestionType.IMAGE) && (
          <McqCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.PSYCHOMETRIC && (
          <PsychometricCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
        {question.type === QuestionType.RATING && (
          <RatingCard question={question} onAnswer={(v) => handleAnswer(v)} />
        )}
```

with:

```tsx
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

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (this also confirms Task 2's `AnswerPayload.value` widening resolved every downstream type error noted in Task 2 Step 3).

Run: `npx eslint app/candidate/exam/page.tsx`
Expected: no new errors.

- [ ] **Step 5: Manually verify in the browser** (deferred if unavailable — note in report)

1. Create a campaign with one Short Answer question (word limit 5) and one Long Answer question (word limit 20).
2. Log in as a candidate, start the exam. Expected: the Short Answer question renders a 3-row textarea with a "0 / 5 words" counter.
3. Type more than 5 words. Expected: typing stops accepting new words once 5 is reached (existing words can still be edited/deleted); counter turns amber at the limit.
4. Submit, confirm the Long Answer question behaves the same way with its own limit and a taller (10-row) textarea.
5. Confirm the exam completes normally afterward (results page loads).

- [ ] **Step 6: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "feat(exam): render Short Answer and Long Answer questions during the exam"
```

---

### Task 10: Grading API — `PATCH /api/admin/responses/[id]/grade`

**Files:**
- Create: `app/api/admin/responses/[id]/grade/route.ts`

**Interfaces:**
- Consumes: `Response.needsGrading`/`gradedAt` (Task 1), `getOwnerId()` (`lib/tenant.ts`).
- Produces: `PATCH /api/admin/responses/[id]/grade` — body `{ score: number }`, sets `score` and `gradedAt`. Consumed by Task 12 (candidate detail admin page).

- [ ] **Step 1: Create the route**

```ts
// app/api/admin/responses/[id]/grade/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const response = await prisma.response.findUnique({
      where: { id },
      select: {
        needsGrading: true,
        question: {
          select: {
            basePoints: true,
            campaign: { select: { ownerId: true } },
          },
        },
      },
    });
    if (!response || response.question.campaign.ownerId !== ownerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!response.needsGrading) {
      return NextResponse.json(
        { error: "This response does not require manual grading" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const score = Number(body.score);
    if (!Number.isFinite(score) || score < 0 || score > response.question.basePoints) {
      return NextResponse.json(
        { error: `Score must be between 0 and ${response.question.basePoints}` },
        { status: 400 }
      );
    }

    const updated = await prisma.response.update({
      where: { id },
      data: { score, gradedAt: new Date() },
    });

    return NextResponse.json({ response: updated });
  } catch (err) {
    console.error("PATCH /api/admin/responses/[id]/grade error:", err);
    return NextResponse.json({ error: "Failed to save grade" }, { status: 500 });
  }
}
```

Ownership is checked by walking `Response → Question → Campaign.ownerId`, since `Response` has no direct `ownerId` of its own — the same indirection pattern already used for `ownedCampaign` elsewhere, just one hop further.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint "app/api/admin/responses/[id]/grade/route.ts"`
Expected: no errors.

- [ ] **Step 3: Manually verify the route** (deferred if unavailable — note in report)

1. Run `npm run dev`, sign in as admin, find a `short_answer`/`long_answer` response id from a completed candidate (via a DB tool or by temporarily logging it in Task 11's route).
2. In DevTools Console on any `/admin` page:
   ```js
   fetch(`/api/admin/responses/<a-real-response-id>/grade`, {
     method: "PATCH",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ score: 7 }),
   }).then(r => r.json()).then(console.log)
   ```
3. Expected: `response.score === 7`, `response.gradedAt` is a timestamp.
4. Try `{ score: 999 }` on a question with `basePoints: 10`. Expected: 400 with the "Score must be between 0 and 10" error.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/responses/[id]/grade/route.ts"
git commit -m "feat(api): add manual grading endpoint for short/long-answer responses"
```

---

### Task 11: Candidate detail API — per-question breakdown for one candidate

**Files:**
- Create: `app/api/admin/campaigns/[id]/results/[candidateId]/route.ts`

**Interfaces:**
- Consumes: `getOwnerId()`/`ownedCampaign()` (`lib/tenant.ts`), `Question.wordLimit` (Task 1), `Response.needsGrading`/`gradedAt` (Task 1).
- Produces: `GET /api/admin/campaigns/[id]/results/[candidateId]` → `{ candidate, items: [{ questionId, type, text, basePoints, wordLimit, response: { id, answer, score, needsGrading, gradedAt } | null }] }`. Consumed by Task 12 (candidate detail page).

- [ ] **Step 1: Create the route**

```ts
// app/api/admin/campaigns/[id]/results/[candidateId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerId, ownedCampaign } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; candidateId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id, candidateId } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, campaignId: id },
      select: { id: true, name: true, email: true, accessId: true, status: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const questions = await prisma.question.findMany({
      where: { campaignId: id },
      orderBy: { orderIndex: "asc" },
      select: { id: true, type: true, text: true, basePoints: true, wordLimit: true },
    });

    const responses = await prisma.response.findMany({
      where: { candidateId },
      select: {
        id: true,
        questionId: true,
        answer: true,
        score: true,
        needsGrading: true,
        gradedAt: true,
      },
    });
    const responseByQuestionId = new Map(responses.map((r) => [r.questionId, r]));

    const items = questions.map((q) => ({
      questionId: q.id,
      type: q.type,
      text: q.text,
      basePoints: q.basePoints,
      wordLimit: q.wordLimit,
      response: responseByQuestionId.get(q.id) ?? null,
    }));

    return NextResponse.json({ candidate, items });
  } catch (err) {
    console.error("GET /api/admin/campaigns/[id]/results/[candidateId] error:", err);
    return NextResponse.json({ error: "Failed to fetch candidate detail" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint "app/api/admin/campaigns/[id]/results/[candidateId]/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/campaigns/[id]/results/[candidateId]/route.ts"
git commit -m "feat(api): add per-candidate question/response breakdown endpoint"
```

---

### Task 12: Candidate detail admin page — grade written answers

**Files:**
- Create: `app/admin/campaigns/[id]/results/[candidateId]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/campaigns/[id]/results/[candidateId]` (Task 11), `PATCH /api/admin/responses/[id]/grade` (Task 10).
- Produces: nothing consumed elsewhere in this plan — leaf admin-UI piece, linked to from Task 13.

- [ ] **Step 1: Create the page**

```tsx
// app/admin/campaigns/[id]/results/[candidateId]/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface CandidateDetailItem {
  questionId: string;
  type: string;
  text: string;
  basePoints: number;
  wordLimit: number | null;
  response: {
    id: string;
    answer: unknown;
    score: number;
    needsGrading: boolean;
    gradedAt: string | null;
  } | null;
}

interface CandidateDetailData {
  candidate: {
    id: string;
    name: string;
    email: string;
    accessId: string;
    status: string;
  };
  items: CandidateDetailItem[];
}

function GradableRow({
  item,
  onGraded,
}: {
  item: CandidateDetailItem;
  onGraded: (questionId: string, score: number, gradedAt: string) => void;
}) {
  const [scoreInput, setScoreInput] = useState(String(item.response?.score ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!item.response) return;
    setError("");
    const score = Number(scoreInput);
    if (!Number.isFinite(score) || score < 0 || score > item.basePoints) {
      setError(`Score must be between 0 and ${item.basePoints}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/responses/${item.response.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save grade");
        return;
      }
      onGraded(item.questionId, score, new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
          {item.type === "short_answer" ? "Short Answer" : "Long Answer"}
        </span>
        {item.response?.needsGrading && !item.response.gradedAt && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Pending review
          </span>
        )}
        {item.response?.gradedAt && (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Graded
          </span>
        )}
      </div>
      <p className="mb-3 text-sm font-medium text-[#0F172A]">{item.text}</p>
      {item.response ? (
        <p className="mb-4 whitespace-pre-line rounded-lg bg-[#F8FAFC] p-3 text-sm text-[#334155]">
          {String(item.response.answer ?? "")}
        </p>
      ) : (
        <p className="mb-4 text-sm italic text-[#94A3B8]">No answer submitted.</p>
      )}
      {item.response && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-[#0F172A]">Score</label>
          <input
            type="number"
            min={0}
            max={item.basePoints}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            className="w-20 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
          />
          <span className="text-xs text-[#64748B]">/ {item.basePoints}</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto rounded-lg bg-[#6366F1] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save grade"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = use(params);
  const [data, setData] = useState<CandidateDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/campaigns/${id}/results/${candidateId}`);
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to load candidate detail");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load candidate detail");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, candidateId]);

  function handleGraded(questionId: string, score: number, gradedAt: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.questionId === questionId && item.response
            ? { ...item, response: { ...item.response, score, gradedAt } }
            : item
        ),
      };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#6366F1] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-7 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const gradableItems = data.items.filter(
    (item) => item.type === "short_answer" || item.type === "long_answer"
  );

  return (
    <div className="px-7 py-6">
      <div className="mb-6">
        <Link
          href={`/admin/campaigns/${id}/results`}
          className="text-xs text-[#64748B] hover:text-[#0F172A]"
        >
          ← Back to Results
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[#0F172A]">{data.candidate.name}</h1>
        <p className="text-sm text-[#64748B]">
          {data.candidate.email} · {data.candidate.accessId}
        </p>
      </div>

      {gradableItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center">
          <p className="text-sm text-[#64748B]">
            This candidate has no Short Answer or Long Answer questions to review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gradableItems.map((item) => (
            <GradableRow key={item.questionId} item={item} onGraded={handleGraded} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint "app/admin/campaigns/[id]/results/[candidateId]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser** (deferred if unavailable — note in report)

1. Navigate to `/admin/campaigns/<id>/results/<candidateId>` for a candidate who answered a Short Answer question.
2. Expected: the question text, their submitted answer, a "Pending review" badge, and a score input (0 to the question's `basePoints`) with a "Save grade" button.
3. Enter a score, click "Save grade". Expected: badge switches to "Graded", no page reload needed.
4. Enter a score above `basePoints`, click "Save grade". Expected: inline error, no badge change.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/campaigns/[id]/results/[candidateId]/page.tsx"
git commit -m "feat(admin): add candidate detail page for grading written answers"
```

---

### Task 13: Results list — "Pending review" flag and link to candidate detail

**Files:**
- Modify: `app/api/admin/campaigns/[id]/results/route.ts`
- Modify: `app/admin/campaigns/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `Response.needsGrading`/`gradedAt` (Task 1), candidate detail page route (Task 12).
- Produces: nothing consumed elsewhere — leaf admin-UI piece, completes this plan.

- [ ] **Step 1: Select the new response fields**

In `app/api/admin/campaigns/[id]/results/route.ts`, replace:

```ts
    const responses = await prisma.response.findMany({
      where: { candidate: { campaignId: id } },
      select: {
        candidateId: true,
        score: true,
        answer: true,
        question: {
          select: {
            type: true,
            correctOption: true,
            basePoints: true,
          },
        },
      },
    });
```

with:

```ts
    const responses = await prisma.response.findMany({
      where: { candidate: { campaignId: id } },
      select: {
        candidateId: true,
        score: true,
        answer: true,
        needsGrading: true,
        gradedAt: true,
        question: {
          select: {
            type: true,
            correctOption: true,
            basePoints: true,
          },
        },
      },
    });
```

- [ ] **Step 2: Compute `pendingReview` per candidate and include it in the response**

Replace:

```ts
    const aggregated = candidates.map((c) => {
      const cResponses = responsesByCandidateId.get(c.id) ?? [];

      const rawScore = cResponses.reduce((sum, r) => sum + r.score, 0);
      const correctCount = cResponses.filter(
        (r) => r.score > 0 && scorable.has(r.question.type)
      ).length;
      const answeredCount = cResponses.length;
```

with:

```ts
    const aggregated = candidates.map((c) => {
      const cResponses = responsesByCandidateId.get(c.id) ?? [];

      const rawScore = cResponses.reduce((sum, r) => sum + r.score, 0);
      const correctCount = cResponses.filter(
        (r) => r.score > 0 && scorable.has(r.question.type)
      ).length;
      const answeredCount = cResponses.length;
      const pendingReview = cResponses.some((r) => r.needsGrading && !r.gradedAt);
```

Then replace:

```ts
      return {
        id: c.id,
        accessId: c.accessId,
        name: c.name,
        email: c.email,
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        multiDisplayViolationCount: c.multiDisplayViolationCount,
        disqualifyReason: c.disqualifyReason,
        totalScore,
        rawScore,
        correctCount,
        answeredCount,
      };
```

with:

```ts
      return {
        id: c.id,
        accessId: c.accessId,
        name: c.name,
        email: c.email,
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        multiDisplayViolationCount: c.multiDisplayViolationCount,
        disqualifyReason: c.disqualifyReason,
        totalScore,
        rawScore,
        correctCount,
        answeredCount,
        pendingReview,
      };
```

- [ ] **Step 3: Type-check and commit the API change**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

```bash
git add "app/api/admin/campaigns/[id]/results/route.ts"
git commit -m "feat(api): flag candidates with ungraded written responses as pending review"
```

- [ ] **Step 4: Add `pendingReview` to the results page's type, badge, and row link**

In `app/admin/campaigns/[id]/results/page.tsx`, replace:

```ts
interface CandidateResult {
  rank: number;
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  tabSwitchCount: number;
  multiDisplayViolationCount: number;
  disqualifyReason: string | null;
  totalScore: number;
  rawScore: number;
  correctCount: number;
  answeredCount: number;
}
```

with:

```ts
interface CandidateResult {
  rank: number;
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  tabSwitchCount: number;
  multiDisplayViolationCount: number;
  disqualifyReason: string | null;
  totalScore: number;
  rawScore: number;
  correctCount: number;
  answeredCount: number;
  pendingReview: boolean;
}
```

- [ ] **Step 5: Make the candidate name a link to the detail page**

Replace:

```tsx
                        {/* Name (+ disqualify reason on sub-row) */}
                        <td className="px-5 py-3">
                          <p className="font-medium text-[#0F172A]">{c.name}</p>
                          <p className="text-xs text-[#64748B]">{c.email}</p>
```

with:

```tsx
                        {/* Name (+ disqualify reason on sub-row) */}
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/campaigns/${id}/results/${c.id}`}
                            className="font-medium text-[#0F172A] hover:text-[#6366F1] hover:underline underline-offset-2"
                          >
                            {c.name}
                          </Link>
                          <p className="text-xs text-[#64748B]">{c.email}</p>
```

(`Link` is already imported at the top of this file; `id` is already in scope from `use(params)`.)

- [ ] **Step 6: Add the "Pending review" badge next to the status badge**

Replace:

```tsx
                        {/* Status badge */}
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              CANDIDATE_STATUS_STYLES[c.status] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {candidateStatusLabel(c.status)}
                          </span>
                        </td>
```

with:

```tsx
                        {/* Status badge */}
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              CANDIDATE_STATUS_STYLES[c.status] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {candidateStatusLabel(c.status)}
                          </span>
                          {c.pendingReview && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Pending review
                            </span>
                          )}
                        </td>
```

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint "app/admin/campaigns/[id]/results/page.tsx"`
Expected: no new errors.

- [ ] **Step 8: Manually verify in the browser** (deferred if unavailable — note in report)

1. Open a campaign's results page where a candidate has an ungraded Short/Long Answer response. Expected: an amber "Pending review" badge next to their status.
2. Click their name. Expected: navigates to `/admin/campaigns/<id>/results/<candidateId>` (Task 12's page).
3. Grade their response there, navigate back to the results list. Expected: the "Pending review" badge is gone and their score reflects the newly graded points.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/campaigns/[id]/results/page.tsx"
git commit -m "feat(admin): show pending-review badge and link to candidate grading page"
```

---

## Post-plan sanity pass

- [ ] Run `npx tsc --noEmit -p tsconfig.json` once more from a clean state — expect zero errors across the whole plan's changes.
- [ ] Run `npx eslint app api components lib` — expect no new errors beyond the pre-existing ones noted in Task 5.
- [ ] On a real dev server, walk through the full lifecycle end-to-end: admin creates a Short Answer and a Long Answer question with different word limits → candidate takes the exam and answers both, hitting the word cap on each → admin sees "Pending review" on the results page → admin opens the candidate detail page, grades both responses → results page score updates and the badge clears.
