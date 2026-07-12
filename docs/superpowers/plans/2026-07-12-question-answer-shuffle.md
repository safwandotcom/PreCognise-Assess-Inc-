# Question & Answer Shuffling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two per-campaign anti-cheat toggles — shuffle question order and shuffle MCQ/Image answer options — so each candidate gets an individually different, but stable, presentation of the same exam.

**Architecture:** All shuffle logic is a set of pure, seed-based functions in `lib/shuffle.ts` (same candidate ID → same permutation, every time, with zero new database state). The two API routes that already handle question delivery (`next-question`) and answer submission (`submit-answer`) become thin callers of those pure functions. `Response.answer` always stores the canonical (un-shuffled) option index, so existing analytics keep working unchanged.

**Tech Stack:** Next.js App Router API routes, Prisma/PostgreSQL, TypeScript. No test framework exists in this repo (no jest/vitest) — verification uses `npx tsx` scripts (already a devDependency, same tool the project uses for `prisma/seed.ts`) plus `npx tsc --noEmit` for type-checking, matching the project's existing conventions.

## Global Constraints

- Both new `Campaign` fields default to `false` — existing campaigns are unaffected until an admin explicitly opts in.
- Answer-option shuffling applies only to `mcq` and `image` question types — never `psychometric` or `rating` (their options are an ordered scale).
- `Response.answer` must always hold the **canonical** option index, regardless of whether shuffling is on, so analytics (`app/api/admin/campaigns/[id]/analytics/route.ts`) remain unchanged and correct.
- No new dependencies. No new test framework — use `npx tsx` for verification scripts, consistent with `prisma/seed.ts`.

---

### Task 1: Prisma schema — add the two campaign toggles

**Files:**
- Modify: `prisma/schema.prisma:80-86` (inside `model Campaign`)

**Interfaces:**
- Produces: `Campaign.antiCheatShuffleQuestions: boolean`, `Campaign.antiCheatShuffleAnswers: boolean` — consumed by Tasks 3, 4, 5, 6.

- [ ] **Step 1: Add the two fields to the schema**

In `prisma/schema.prisma`, find this block (currently lines 80-86):

```prisma
  antiCheatTabSwitch         Boolean        @default(true)
  tabSwitchLimit             Int            @default(3)
  antiCheatFullscreen        Boolean        @default(false)
  antiCheatCopyPaste         Boolean        @default(true)
  antiCheatRightClick        Boolean        @default(true)
  antiCheatScreenshot        Boolean        @default(true)
  antiCheatDevTools          Boolean        @default(true)
```

Replace it with:

```prisma
  antiCheatTabSwitch         Boolean        @default(true)
  tabSwitchLimit             Int            @default(3)
  antiCheatFullscreen        Boolean        @default(false)
  antiCheatCopyPaste         Boolean        @default(true)
  antiCheatRightClick        Boolean        @default(true)
  antiCheatScreenshot        Boolean        @default(true)
  antiCheatDevTools          Boolean        @default(true)
  antiCheatShuffleQuestions  Boolean        @default(false)
  antiCheatShuffleAnswers    Boolean        @default(false)
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_shuffle_toggles`

Expected output: a new folder under `prisma/migrations/` named like `<timestamp>_add_shuffle_toggles`, ending with `Your database is now in sync with your schema.` and `✔ Generated Prisma Client`.

- [ ] **Step 3: Verify the generated client has the new fields**

Run: `npx tsc --noEmit`

Expected: exits with no errors (this only confirms the project still type-checks after `prisma generate` updated the client types — the fields themselves aren't used anywhere yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add antiCheatShuffleQuestions and antiCheatShuffleAnswers to Campaign"
```

---

### Task 2: `lib/shuffle.ts` — pure seeded-shuffle utilities

**Files:**
- Create: `lib/shuffle.ts`
- Create: `scripts/verify-shuffle.ts` (throwaway verification script, not part of the app bundle)

**Interfaces:**
- Consumes: nothing (pure functions, no imports from the rest of the app)
- Produces:
  - `seededPermutation(n: number, seed: string): number[]` — `perm[displayPosition] = originalIndex`
  - `applySeededShuffle<T>(items: T[], seed: string): T[]`
  - `pickNextQuestion<Q extends { id: string }>(questions: Q[], answeredIds: string[], seed: string, shuffle: boolean): Q | undefined`
  - `translateDisplayIndexToCanonical(displayIndex: number, optionCount: number, seed: string): number`
  - Consumed by Task 3 (`next-question` route) and Task 4 (`submit-answer` route).

- [ ] **Step 1: Write the verification script (fails first — module doesn't exist yet)**

Create `scripts/verify-shuffle.ts`:

```ts
import {
  seededPermutation,
  applySeededShuffle,
  pickNextQuestion,
  translateDisplayIndexToCanonical,
} from "../lib/shuffle";

let failures = 0;
function check(label: string, condition: boolean) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

// 1. Same seed -> same permutation
const permA = seededPermutation(8, "candidate-1");
const permB = seededPermutation(8, "candidate-1");
check("same seed produces identical permutation", JSON.stringify(permA) === JSON.stringify(permB));

// 2. Permutation is a full covering of 0..n-1 with no duplicates
const sorted = [...permA].sort((a, b) => a - b);
check(
  "permutation of length 8 contains every index 0-7 exactly once",
  JSON.stringify(sorted) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]),
);

// 3. Different seeds usually produce different permutations
const permC = seededPermutation(8, "candidate-2");
check("different seeds produce different permutations", JSON.stringify(permA) !== JSON.stringify(permC));

// 4. applySeededShuffle reorders an arbitrary array consistently with seededPermutation
const items = ["a", "b", "c", "d"];
const shuffled = applySeededShuffle(items, "seed-x");
const perm = seededPermutation(4, "seed-x");
const expected = perm.map((i) => items[i]);
check("applySeededShuffle matches seededPermutation mapping", JSON.stringify(shuffled) === JSON.stringify(expected));

// 5. pickNextQuestion: shuffle disabled -> returns first unanswered in given order
const qs = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
const noShuffle = pickNextQuestion(qs, [], "candidate-1", false);
check("shuffle disabled returns first question unchanged", noShuffle?.id === "q1");

const skipFirst = pickNextQuestion(qs, ["q1"], "candidate-1", false);
check("shuffle disabled skips answered questions in order", skipFirst?.id === "q2");

// 6. pickNextQuestion: shuffle enabled -> two different candidate seeds can get different first questions
const firstForCandidateA = pickNextQuestion(qs, [], "candidate-A", true);
const firstForCandidateB = pickNextQuestion(qs, [], "candidate-B", true);
console.log(
  `Candidate A first question: ${firstForCandidateA?.id}, Candidate B first question: ${firstForCandidateB?.id}`,
);
check("pickNextQuestion returns a valid question id for candidate A", qs.some((q) => q.id === firstForCandidateA?.id));
check("pickNextQuestion returns a valid question id for candidate B", qs.some((q) => q.id === firstForCandidateB?.id));

// 7. pickNextQuestion: shuffle enabled -> same candidate always gets the same first question across repeated calls
const repeat1 = pickNextQuestion(qs, [], "candidate-A", true);
const repeat2 = pickNextQuestion(qs, [], "candidate-A", true);
check("same candidate gets stable order across repeated calls", repeat1?.id === repeat2?.id);

// 8. translateDisplayIndexToCanonical round-trips correctly
const optionSeed = "candidate-1:question-1";
const optionPerm = seededPermutation(4, optionSeed);
const displayIndexToCheck = 2;
const canonical = translateDisplayIndexToCanonical(displayIndexToCheck, 4, optionSeed);
check(
  "translateDisplayIndexToCanonical matches seededPermutation directly",
  canonical === optionPerm[displayIndexToCheck],
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll shuffle checks passed.");
```

- [ ] **Step 2: Run it to confirm it fails (module doesn't exist yet)**

Run: `npx tsx scripts/verify-shuffle.ts`
Expected: FAIL — `Cannot find module '../lib/shuffle'` (or similar TypeScript module-resolution error).

- [ ] **Step 3: Implement `lib/shuffle.ts`**

Create `lib/shuffle.ts`:

```ts
/**
 * Deterministic, seed-based shuffling for the "shuffle question order" and
 * "shuffle answer options" anti-cheat features. Nothing here is a security
 * boundary — it only needs to be stable per seed and reasonably well mixed,
 * not cryptographically unpredictable.
 */

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
 * Returns a permutation array `perm` of length `n` such that
 * `perm[displayPosition] = originalIndex`. The same seed always produces
 * the same permutation.
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

/**
 * Picks the next unanswered question for a candidate.
 * When `shuffle` is false, behaves exactly like the pre-existing behavior:
 * first question (in the given order) not present in `answeredIds`.
 * When `shuffle` is true, the question list is reordered per-seed first.
 */
export function pickNextQuestion<Q extends { id: string }>(
  questions: Q[],
  answeredIds: string[],
  seed: string,
  shuffle: boolean,
): Q | undefined {
  const ordered = shuffle ? applySeededShuffle(questions, seed) : questions;
  return ordered.find((q) => !answeredIds.includes(q.id));
}

/**
 * Translates a display-position index (what the candidate clicked, in their
 * shuffled view) back into the canonical index stored in the database.
 */
export function translateDisplayIndexToCanonical(
  displayIndex: number,
  optionCount: number,
  seed: string,
): number {
  const perm = seededPermutation(optionCount, seed);
  return perm[displayIndex];
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npx tsx scripts/verify-shuffle.ts`
Expected: every line prints `PASS: ...`, ending with `All shuffle checks passed.` and exit code 0.

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/shuffle.ts scripts/verify-shuffle.ts
git commit -m "feat: add seeded shuffle utilities for question/answer randomization"
```

---

### Task 3: Deliver shuffled question order and options — `next-question` route

**Files:**
- Modify: `app/api/assessment/next-question/route.ts`

**Interfaces:**
- Consumes: `pickNextQuestion`, `applySeededShuffle` from `lib/shuffle.ts` (Task 2)
- Produces: no new exports — this route's behavior change is consumed only by the candidate exam page, which already renders whatever `options` order the API returns (verified: `components/exam/McqCard.tsx:38` does `question.options.map((option, index) => ...)` with no assumption about canonical order).

- [ ] **Step 1: Add the campaign flags to the existing settings/candidate lookups**

In `app/api/assessment/next-question/route.ts`, find:

```ts
    const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { campaignId: true, status: true, country: true, campaign: { select: { completionMessage: true } } },
    });
```

Replace with:

```ts
    const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: {
            campaignId: true,
            status: true,
            country: true,
            campaign: {
                select: {
                    completionMessage: true,
                    antiCheatShuffleQuestions: true,
                    antiCheatShuffleAnswers: true,
                },
            },
        },
    });
```

- [ ] **Step 2: Replace the "find next question" logic to use `pickNextQuestion`**

Find:

```ts
    // Question IDs this candidate has already submitted a Response for
    const answered = await prisma.response.findMany({
        where: { candidateId },
        select: { questionId: true },
    });
    const answeredIds = answered.map((r) => r.questionId);

    // Total questions in this campaign
    const totalQuestions = await prisma.question.count({
        where: { campaignId: candidate.campaignId },
    });

    const next = await prisma.question.findFirst({
        where: {
            campaignId: candidate.campaignId,
            id: { notIn: answeredIds },
        },
        orderBy: { orderIndex: "asc" },
    });
```

Replace with:

```ts
    // Question IDs this candidate has already submitted a Response for
    const answered = await prisma.response.findMany({
        where: { candidateId },
        select: { questionId: true },
    });
    const answeredIds = answered.map((r) => r.questionId);

    // All questions in this campaign, canonical order
    const allQuestions = await prisma.question.findMany({
        where: { campaignId: candidate.campaignId },
        orderBy: { orderIndex: "asc" },
    });
    const totalQuestions = allQuestions.length;

    const next = pickNextQuestion(
        allQuestions,
        answeredIds,
        candidateId,
        candidate.campaign?.antiCheatShuffleQuestions ?? false,
    );
```

- [ ] **Step 3: Add the import**

At the top of the file, alongside the existing imports:

```ts
import { pickNextQuestion, applySeededShuffle } from "@/lib/shuffle";
```

- [ ] **Step 4: Shuffle the options for display when the campaign has answer-shuffling on**

Find:

```ts
    const question: PublicQuestion = {
        id: next.id,
        type: next.type as unknown as QuestionType,
        text: next.text,
        imageUrl: next.imageUrl,
        options: next.options as (string | number)[],
        timeLimitSec: next.timeLimitSec,
        basePoints: next.basePoints,
        // Respect global speed bonus toggle — zero it out if disabled
        speedBonusMax: settings.speedBonusEnabled ? next.speedBonusMax : 0,
        orderIndex: next.orderIndex,
    };
```

Replace with:

```ts
    const rawOptions = next.options as (string | number)[];
    const shouldShuffleOptions =
        (candidate.campaign?.antiCheatShuffleAnswers ?? false) &&
        (next.type === "mcq" || next.type === "image");
    const displayOptions = shouldShuffleOptions
        ? applySeededShuffle(rawOptions, `${candidateId}:${next.id}`)
        : rawOptions;

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
        orderIndex: next.orderIndex,
    };
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification (no automated route-level test harness exists in this repo)**

1. Run `npm run dev` (and `cd socket-server && npm run dev` in a second terminal, per `README.md`).
2. In the admin UI, create a campaign with at least 3 MCQ questions, add 2 candidates via CSV import, and (after Task 6 is done) turn on both "Shuffle Question Order" and "Shuffle Answer Options". Until Task 6 ships the UI, you can instead set the two fields directly with:
   `npx prisma studio` → open the `Campaign` row → set `antiCheatShuffleQuestions` and `antiCheatShuffleAnswers` to `true`.
3. Start the campaign, log in as both candidates in two separate browser sessions, and confirm the first question shown differs between the two candidates (or that option order differs, if question order happens to coincide for both — with only 3 questions this can happen by chance; add more questions if needed to make the difference obvious).
4. Reload one candidate's exam page (or re-poll) before answering — confirm they see the *same* question again, not a re-shuffled one.

- [ ] **Step 7: Commit**

```bash
git add app/api/assessment/next-question/route.ts
git commit -m "feat: deliver shuffled question order and answer options per candidate"
```

---

### Task 4: Reverse-map shuffled answers for scoring — `submit-answer` route

**Files:**
- Modify: `app/api/assessment/submit-answer/route.ts`

**Interfaces:**
- Consumes: `translateDisplayIndexToCanonical` from `lib/shuffle.ts` (Task 2)
- Produces: `Response.answer` in the database always holds the canonical option index — consumed (unmodified) by `app/api/admin/campaigns/[id]/analytics/route.ts`, which already does `qRes.filter(r => r.answer === idx)` against the canonical `q.options` array.

- [ ] **Step 1: Fetch the campaign's shuffle flag alongside the question**

Find:

```ts
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
```

Replace with:

```ts
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { campaign: { select: { antiCheatShuffleAnswers: true } } },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
```

- [ ] **Step 2: Translate the submitted display-index back to the canonical index before scoring**

Find:

```ts
  // Respect global speed bonus toggle
  const settings = await getSettings();
  const effectiveSpeedBonusMax = settings.speedBonusEnabled ? question.speedBonusMax : 0;

  const isCorrect = question.correctOption !== null && value === question.correctOption;
```

Replace with:

```ts
  // Respect global speed bonus toggle
  const settings = await getSettings();
  const effectiveSpeedBonusMax = settings.speedBonusEnabled ? question.speedBonusMax : 0;

  // If answer-shuffling is on for this campaign, `value` is the index the
  // candidate clicked in *their* shuffled view — translate it back to the
  // canonical index stored in `question.correctOption` before scoring, and
  // before persisting, so analytics stay meaningful regardless of shuffling.
  const shouldUnshuffle =
    question.campaign.antiCheatShuffleAnswers &&
    (question.type === "mcq" || question.type === "image");

  const canonicalValue =
    shouldUnshuffle && typeof value === "number"
      ? translateDisplayIndexToCanonical(
          value,
          (question.options as unknown[]).length,
          `${candidateId}:${questionId}`,
        )
      : value;

  const isCorrect = question.correctOption !== null && canonicalValue === question.correctOption;
```

- [ ] **Step 3: Store the canonical value, not the raw submitted value**

Find:

```ts
  await prisma.response.create({
    data: {
      candidateId,
      questionId,
      answer: value === null || value === undefined ? Prisma.JsonNull : value,
      score: scoreEarned,
      responseTimeMs,
    },
  });
```

Replace with:

```ts
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

- [ ] **Step 4: Add the import**

At the top of the file, alongside the existing imports:

```ts
import { translateDisplayIndexToCanonical } from "@/lib/shuffle";
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Continuing the manual setup from Task 3, Step 6:

1. As a candidate in the shuffle-enabled campaign, deliberately select the option you know is correct (check via `npx prisma studio` → `Question.correctOption` for that question, then find which display position it landed on for your candidate — or just answer every question correctly and confirm your final score is 100%).
2. Confirm the score you receive matches what you'd get with shuffling off — i.e., picking the actually-correct option scores correctly regardless of its on-screen position.
3. In `npx prisma studio`, open the `Response` row for that answer and confirm `answer` matches the question's canonical `correctOption` index (not whatever position you clicked on-screen, if they differ).

- [ ] **Step 7: Commit**

```bash
git add app/api/assessment/submit-answer/route.ts
git commit -m "feat: unshuffle submitted answers before scoring and storage"
```

---

### Task 5: Accept the two new fields in the admin PATCH endpoint

**Files:**
- Modify: `app/api/admin/campaigns/[id]/route.ts:31,50` (PATCH handler)

**Interfaces:**
- Consumes: nothing new
- Produces: `PATCH /api/admin/campaigns/[id]` accepts `antiCheatShuffleQuestions` and `antiCheatShuffleAnswers` in the request body — consumed by Task 6 (admin UI save call).

- [ ] **Step 1: Add both fields to the destructured request body**

Find (in the `PATCH` handler):

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, completionMessage, instructionsHtml } = body;
```

Replace with:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
```

- [ ] **Step 2: Add both fields to the conditional update block**

Find:

```ts
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(completionMessage !== undefined && { completionMessage: completionMessage?.trim() || null }),
```

Replace with:

```ts
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
        ...(antiCheatShuffleAnswers !== undefined && { antiCheatShuffleAnswers }),
        ...(completionMessage !== undefined && { completionMessage: completionMessage?.trim() || null }),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, from a terminal:

```bash
curl -X PATCH http://localhost:3000/api/admin/campaigns/<a-real-campaign-id> \
  -H "Content-Type: application/json" \
  -d '{"antiCheatShuffleQuestions": true, "antiCheatShuffleAnswers": true}'
```

(Replace `<a-real-campaign-id>` with an id from `npx prisma studio`. If Clerk middleware blocks unauthenticated `curl` requests to `/api/admin/**`, run this check from the browser's dev console instead while logged into `/admin`, using `fetch(...)` with the same body, or simply do this check via the UI once Task 6 lands.)

Expected: `200 OK` with the updated campaign JSON showing `"antiCheatShuffleQuestions": true, "antiCheatShuffleAnswers": true`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/campaigns/[id]/route.ts
git commit -m "feat: accept shuffle toggles in campaign PATCH endpoint"
```

---

### Task 6: Admin UI — two new toggle switches

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/campaigns/[id]` accepting `antiCheatShuffleQuestions` / `antiCheatShuffleAnswers` (Task 5)
- Produces: nothing consumed elsewhere — this is the leaf UI.

- [ ] **Step 1: Add the two fields to the `Campaign` interface**

Find (near the top of the file):

```ts
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  completionMessage: string | null;
```

Replace with:

```ts
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  antiCheatShuffleQuestions: boolean;
  antiCheatShuffleAnswers: boolean;
  completionMessage: string | null;
```

- [ ] **Step 2: Add `useState` hooks**

Find:

```ts
  const [antiCheatDevTools, setAntiCheatDevTools] = useState(
    campaign.antiCheatDevTools,
  );
  const [completionMessage, setCompletionMessage] = useState(
```

Replace with:

```ts
  const [antiCheatDevTools, setAntiCheatDevTools] = useState(
    campaign.antiCheatDevTools,
  );
  const [antiCheatShuffleQuestions, setAntiCheatShuffleQuestions] = useState(
    campaign.antiCheatShuffleQuestions,
  );
  const [antiCheatShuffleAnswers, setAntiCheatShuffleAnswers] = useState(
    campaign.antiCheatShuffleAnswers,
  );
  const [completionMessage, setCompletionMessage] = useState(
```

- [ ] **Step 3: Sync the new fields when the campaign prop changes**

Find:

```ts
    setAntiCheatDevTools(campaign.antiCheatDevTools);
    setCompletionMessage(campaign.completionMessage ?? "");
```

Replace with:

```ts
    setAntiCheatDevTools(campaign.antiCheatDevTools);
    setAntiCheatShuffleQuestions(campaign.antiCheatShuffleQuestions);
    setAntiCheatShuffleAnswers(campaign.antiCheatShuffleAnswers);
    setCompletionMessage(campaign.completionMessage ?? "");
```

- [ ] **Step 4: Include the new fields in the save payload**

Find:

```ts
          antiCheatDevTools,
          completionMessage: completionMessage.trim() || null,
```

Replace with:

```ts
          antiCheatDevTools,
          antiCheatShuffleQuestions,
          antiCheatShuffleAnswers,
          completionMessage: completionMessage.trim() || null,
```

- [ ] **Step 5: Add the two toggle switches in the Anti-Cheat panel JSX**

Find (the closing of the "Block DevTools shortcuts" toggle, immediately before the anti-cheat panel's closing `</div>`):

```tsx
              {/* Block DevTools shortcuts */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Block DevTools shortcuts
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Prevent F12, Ctrl+Shift+I/J/C and Ctrl+U
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatDevTools}
                  onClick={() => setAntiCheatDevTools((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatDevTools ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatDevTools ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>
```

Replace with:

```tsx
              {/* Block DevTools shortcuts */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Block DevTools shortcuts
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Prevent F12, Ctrl+Shift+I/J/C and Ctrl+U
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatDevTools}
                  onClick={() => setAntiCheatDevTools((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatDevTools ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatDevTools ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Shuffle question order */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Shuffle question order
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Give each candidate a different question sequence, so no
                    one can call out answers by question number
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatShuffleQuestions}
                  onClick={() => setAntiCheatShuffleQuestions((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatShuffleQuestions ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatShuffleQuestions ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Shuffle answer options */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Shuffle answer options
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Randomize multiple-choice option order per candidate.
                    Doesn&apos;t apply to rating or psychometric questions
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatShuffleAnswers}
                  onClick={() => setAntiCheatShuffleAnswers((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatShuffleAnswers ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatShuffleAnswers ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

1. Run `npm run dev`, log into `/admin`, open any campaign's detail page.
2. Confirm two new toggles, "Shuffle question order" and "Shuffle answer options", appear at the bottom of the Anti-Cheat panel, styled identically to the existing toggles.
3. Turn both on, click Save, reload the page, and confirm both toggles remain on (proves the PATCH round-trip and the `useEffect` sync both work).
4. Turn both off, click Save, reload, confirm both are off again.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "feat: add shuffle question/answer toggles to campaign anti-cheat panel"
```

---

### Task 7: Fix candidate progress indicator to use answered-count, not database order

**Files:**
- Modify: `app/candidate/exam/page.tsx:370`

**Interfaces:**
- Consumes: existing `progress.answered` state (already set at `app/candidate/exam/page.tsx:103`)
- Produces: nothing new — corrects a display bug that would otherwise surface once question order can be shuffled.

- [ ] **Step 1: Change `currentIndex` to use `progress.answered` instead of `question.orderIndex`**

Find:

```tsx
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={question.orderIndex}
            />
          )}
```

Replace with:

```tsx
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={progress.answered}
            />
          )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

1. With `npm run dev` running, log in as a candidate in any campaign (shuffle on or off) and step through the exam.
2. Confirm the progress indicator shows "Question 1", "Question 2", etc. in the correct sequence matching the actual number of questions answered so far — both with a non-shuffled campaign (regression check) and a shuffled one (from Task 3/6 setup).

- [ ] **Step 4: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "fix: base exam progress indicator on answered count, not database order index"
```

---

## Self-Review Notes

- **Spec coverage:** Every section of `docs/superpowers/specs/2026-07-12-question-answer-shuffle-design.md` maps to a task — data model (Task 1), shuffle utility (Task 2), question-order delivery (Task 3), answer-option delivery (Task 3) and reverse-mapping (Task 4), admin API (Task 5), admin UI (Task 6), candidate progress fix (Task 7).
- **Placeholder scan:** no TBD/TODO; every step has literal code or literal commands with expected output.
- **Type consistency:** `pickNextQuestion`, `applySeededShuffle`, `translateDisplayIndexToCanonical`, and `seededPermutation` are defined once in Task 2 and referenced with identical names/signatures in Tasks 3 and 4. `antiCheatShuffleQuestions` / `antiCheatShuffleAnswers` are spelled identically across Tasks 1, 3, 4, 5, and 6.
