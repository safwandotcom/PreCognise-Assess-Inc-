# Exam Defaults, Sticky Timer, and Camera/Mic Presence Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New campaigns start with all friction-prone anti-cheat rules off (admin opts in), the exam timer stays visible while scrolling on mobile, and admins can require a client-side camera/microphone presence check during the exam.

**Architecture:** Three independent slices bolted onto the existing candidate-exam and campaign-admin code. (1) is a pure Prisma schema default change. (2) is a CSS-only change to one JSX wrapper. (3) follows the exact plumbing the existing `antiCheatFullscreen` field already uses end-to-end (schema → PATCH route → Overview tab toggle → campaign-config/instructions routes → instructions page → exam page), and the exam-page enforcement mirrors the existing fullscreen-exit blocking-overlay pattern, reusing the existing tab-switch violation counter instead of inventing a new one.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Prisma + Postgres, Tailwind CSS, no automated test framework in the main app (confirmed: no jest/vitest config, no `*.test.*` files under `app/`, `components/`, or `lib/` — only `socket-server/` has its own Jest setup for a separate package). `getUserMedia` is a browser-native Web API — no new dependency.

## Global Constraints

- No unit/integration test framework exists in the Next.js app. Every task's verification step is therefore a concrete, exact manual check (dev server + browser, or an exact `curl`/PowerShell request) plus `npx tsc --noEmit` and `npx eslint <changed files>` — not `pytest`/`jest`-style automated tests. Do not introduce a new test framework as part of this plan; that's out of scope.
- Follow the existing per-toggle code pattern for anti-cheat fields exactly (see `antiCheatFullscreen` for reference) — same shape of state, sync effect, save payload, PATCH destructuring, select clauses. Do not refactor unrelated toggles.
- `disqualifyOnDuplicateLogin` stays `@default(true)` — explicitly confirmed with the user, do not touch it.
- The camera/mic feature is presence-only: never record, store, or transmit stream data anywhere. The only server round-trip it triggers is the existing `/api/candidate/tab-switch` violation call, reused as-is.
- Dev server: `npm run dev` (Next.js). Migrations: `npx prisma migrate dev --name <name>` (this repo's `.env` has `DATABASE_URL` configured for local dev).

---

### Task 1: Prisma schema — relax anti-cheat defaults, add camera field

**Files:**
- Modify: `prisma/schema.prisma:83-91`

**Interfaces:**
- Produces: `Campaign.antiCheatCamera` (new `Boolean @default(false)` column), and `Campaign.antiCheatTabSwitch` / `antiCheatCopyPaste` / `antiCheatRightClick` / `antiCheatScreenshot` / `antiCheatDevTools` now default `false` instead of `true`. All later tasks that read/write these fields depend on this migration having run.

- [ ] **Step 1: Edit the Campaign model's anti-cheat block**

In `prisma/schema.prisma`, replace lines 83-91:

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

with:

```prisma
  antiCheatTabSwitch         Boolean        @default(false)
  tabSwitchLimit             Int            @default(3)
  antiCheatFullscreen        Boolean        @default(false)
  antiCheatCopyPaste         Boolean        @default(false)
  antiCheatRightClick        Boolean        @default(false)
  antiCheatScreenshot        Boolean        @default(false)
  antiCheatDevTools          Boolean        @default(false)
  antiCheatCamera            Boolean        @default(false)
  antiCheatShuffleQuestions  Boolean        @default(false)
  antiCheatShuffleAnswers    Boolean        @default(false)
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name relax_anticheat_defaults_add_camera`

Expected: Prisma prints a generated migration under `prisma/migrations/<timestamp>_relax_anticheat_defaults_add_camera/migration.sql` containing `ALTER TABLE "Campaign" ALTER COLUMN ...` statements for the five changed defaults and `ADD COLUMN "antiCheatCamera" BOOLEAN NOT NULL DEFAULT false`, then `Your database is now in sync with your schema.` No errors.

- [ ] **Step 3: Verify the schema is valid and the client regenerated**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (this confirms the regenerated Prisma client's `Campaign` type now includes `antiCheatCamera: boolean`, which later tasks depend on).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): default anti-cheat toggles off, add camera/mic requirement field"
```

---

### Task 2: Sticky timer/progress header on the exam page

**Files:**
- Modify: `app/candidate/exam/page.tsx:371-383`

**Interfaces:**
- None — purely a CSS/JSX wrapper change, no new props, state, or exports. Independent of every other task in this plan.

- [ ] **Step 1: Make the header row sticky**

In `app/candidate/exam/page.tsx`, replace:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-end gap-6 mb-8">
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={progress.answered}
            />
          )}
          <div className="shrink-0">
            <TimerRing key={question.id} timeLimit={question.timeLimitSec} onExpire={handleTimerExpire} />
          </div>
        </div>
```

with:

```tsx
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="sticky top-0 z-30 mb-8 flex items-end gap-6 bg-gray-900 py-3">
          {progress && (
            <QuestionProgress
              answered={progress.answered}
              total={progress.total}
              currentIndex={progress.answered}
            />
          )}
          <div className="shrink-0">
            <TimerRing key={question.id} timeLimit={question.timeLimitSec} onExpire={handleTimerExpire} />
          </div>
        </div>
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/candidate/exam/page.tsx`
Expected: no new errors (the pre-existing `react-hooks/exhaustive-deps` warning on line ~202 is unrelated and may still appear — that's expected, not a regression).

- [ ] **Step 3: Manually verify in the browser**

1. Run: `npm run dev`
2. Open Chrome DevTools device toolbar (or resize the window to ~380px wide) to simulate a phone.
3. Navigate through a candidate exam session to a question with enough MCQ options that the page is taller than the viewport (4 long options is usually enough).
4. Scroll down inside the question content.
5. Expected: the "N of Total" progress row and the circular timer stay pinned at the very top of the viewport instead of scrolling away, and the timer's countdown remains legible the whole time.

- [ ] **Step 4: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "fix(exam): keep question timer visible while scrolling on mobile"
```

---

### Task 3: Shared settings type — add `antiCheatCamera`

**Files:**
- Modify: `lib/get-settings.ts`

**Interfaces:**
- Produces: `AssessmentSettings.antiCheatCamera: boolean`, `SETTINGS_DEFAULTS.antiCheatCamera === false`. Consumed by Task 9 (`app/candidate/exam/page.tsx` reads `settingsRef.current.antiCheatCamera`).

- [ ] **Step 1: Add the field to the type and defaults**

In `lib/get-settings.ts`, replace:

```ts
export type AssessmentSettings = {
  antiCheatTabSwitch: boolean;
  antiCheatContextMenu: boolean;
  antiCheatCopyPaste: boolean;
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  speedBonusEnabled: boolean;
  gracePeriodSec: number;
  geoRestriction: string;
  tabSwitchLimit: number;
  antiCheatFullscreen: boolean;
  antiCheatRightClick: boolean;
};

export const SETTINGS_DEFAULTS: AssessmentSettings = {
  antiCheatTabSwitch: true,
  antiCheatContextMenu: true,
  antiCheatCopyPaste: true,
  antiCheatScreenshot: true,
  antiCheatDevTools: true,
  speedBonusEnabled: true,
  gracePeriodSec: 0,
  geoRestriction: "",
  tabSwitchLimit: 3,
  antiCheatFullscreen: false,
  antiCheatRightClick: true,
};
```

with:

```ts
export type AssessmentSettings = {
  antiCheatTabSwitch: boolean;
  antiCheatContextMenu: boolean;
  antiCheatCopyPaste: boolean;
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  antiCheatCamera: boolean;
  speedBonusEnabled: boolean;
  gracePeriodSec: number;
  geoRestriction: string;
  tabSwitchLimit: number;
  antiCheatFullscreen: boolean;
  antiCheatRightClick: boolean;
};

export const SETTINGS_DEFAULTS: AssessmentSettings = {
  antiCheatTabSwitch: true,
  antiCheatContextMenu: true,
  antiCheatCopyPaste: true,
  antiCheatScreenshot: true,
  antiCheatDevTools: true,
  antiCheatCamera: false,
  speedBonusEnabled: true,
  gracePeriodSec: 0,
  geoRestriction: "",
  tabSwitchLimit: 3,
  antiCheatFullscreen: false,
  antiCheatRightClick: true,
};
```

Note: `getSettings()` below this block already returns a fixed object listing each field explicitly (not a spread) — it does **not** need an `antiCheatCamera` line added, because (exactly like `antiCheatFullscreen` and `antiCheatRightClick` already do) camera enforcement is campaign-scoped, not part of the global `AssessmentSettings` Prisma model. `getSettings()`'s return value is consumed by `app/admin/settings/page.tsx` (the global Settings page), which does not display a camera toggle — see Task 5's scope note.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/get-settings.ts
git commit -m "feat(exam): add antiCheatCamera to shared exam settings type"
```

---

### Task 4: Admin PATCH route — accept `antiCheatCamera`

**Files:**
- Modify: `app/api/admin/campaigns/[id]/route.ts:39,67-75`

**Interfaces:**
- Consumes: `prisma.campaign` client with `antiCheatCamera: boolean` field (from Task 1).
- Produces: `PATCH /api/admin/campaigns/[id]` now accepts an optional `antiCheatCamera: boolean` in its JSON body and persists it. Consumed by Task 5 (Overview tab save payload).

- [ ] **Step 1: Destructure the new field**

In `app/api/admin/campaigns/[id]/route.ts`, line 39, replace:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
```

with:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
```

- [ ] **Step 2: Apply it in the update data object**

Replace:

```ts
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
```

with:

```ts
        ...(antiCheatDevTools !== undefined && { antiCheatDevTools }),
        ...(antiCheatCamera !== undefined && { antiCheatCamera }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify the route**

1. Run: `npm run dev`
2. Sign in as an admin in the browser, open DevTools → Application/Storage → find the Clerk session, or simpler: use the already-authenticated browser session to run this from the DevTools Console on any `/admin` page (it will reuse the browser's auth cookies):
   ```js
   fetch(`/api/admin/campaigns/<a-real-campaign-id>`, {
     method: "PATCH",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ antiCheatCamera: true }),
   }).then(r => r.json()).then(console.log)
   ```
   Replace `<a-real-campaign-id>` with an id from `/admin/campaigns` (visible in the URL when you open a campaign).
3. Expected: response JSON's `campaign.antiCheatCamera` is `true`.
4. Run the same fetch with `antiCheatCamera: false` and confirm it flips back.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/campaigns/[id]/route.ts
git commit -m "feat(api): accept antiCheatCamera on campaign PATCH"
```

---

### Task 5: Admin Overview tab — camera/mic toggle

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx:34-63` (Campaign interface), `:213-237` (OverviewTab state), `:262-270` (sync effect), `:293-301` (save payload), `:845-847` (insert new toggle block)

**Interfaces:**
- Consumes: `PATCH /api/admin/campaigns/[id]` accepting `antiCheatCamera` (Task 4).
- Produces: nothing new consumed by later tasks — this is the leaf admin-UI piece.

- [ ] **Step 1: Add the field to the `Campaign` interface**

Replace:

```ts
  antiCheatDevTools: boolean;
  antiCheatShuffleQuestions: boolean;
  antiCheatShuffleAnswers: boolean;
```

with:

```ts
  antiCheatDevTools: boolean;
  antiCheatCamera: boolean;
  antiCheatShuffleQuestions: boolean;
  antiCheatShuffleAnswers: boolean;
```

(this is in the `interface Campaign { ... }` block, originally at lines 55-57)

- [ ] **Step 2: Add local state in `OverviewTab`**

Replace:

```ts
  const [antiCheatDevTools, setAntiCheatDevTools] = useState(
    campaign.antiCheatDevTools,
  );
  const [antiCheatShuffleQuestions, setAntiCheatShuffleQuestions] = useState(
    campaign.antiCheatShuffleQuestions,
  );
```

with:

```ts
  const [antiCheatDevTools, setAntiCheatDevTools] = useState(
    campaign.antiCheatDevTools,
  );
  const [antiCheatCamera, setAntiCheatCamera] = useState(
    campaign.antiCheatCamera,
  );
  const [antiCheatShuffleQuestions, setAntiCheatShuffleQuestions] = useState(
    campaign.antiCheatShuffleQuestions,
  );
```

- [ ] **Step 3: Sync the new state when `campaign` reloads**

Replace:

```ts
    setAntiCheatDevTools(campaign.antiCheatDevTools);
    setAntiCheatShuffleQuestions(campaign.antiCheatShuffleQuestions);
```

with:

```ts
    setAntiCheatDevTools(campaign.antiCheatDevTools);
    setAntiCheatCamera(campaign.antiCheatCamera);
    setAntiCheatShuffleQuestions(campaign.antiCheatShuffleQuestions);
```

- [ ] **Step 4: Include it in the save payload**

Replace:

```ts
          antiCheatDevTools,
          antiCheatShuffleQuestions,
```

with:

```ts
          antiCheatDevTools,
          antiCheatCamera,
          antiCheatShuffleQuestions,
```

- [ ] **Step 5: Add the toggle to the Anti-cheat & Security section**

Insert this block right after the "Block DevTools shortcuts" `</label>` (which currently ends the block right before the `{/* Shuffle question order */}` comment):

```tsx
              {/* Require camera & microphone */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Require camera &amp; microphone
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Candidate must grant camera and microphone access and keep it on for the whole exam
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatCamera}
                  onClick={() => setAntiCheatCamera((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatCamera ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatCamera ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

```

So the surrounding structure reads (abbreviated):

```tsx
              {/* Block DevTools shortcuts */}
              <label ...>
                ...
              </label>

              {/* Require camera & microphone */}
              <label ...>
                ...
              </label>

              {/* Shuffle question order */}
              <label ...>
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/admin/campaigns/[id]/page.tsx`
Expected: no new errors.

- [ ] **Step 7: Manually verify in the browser**

1. Run: `npm run dev`, sign in as admin, open any campaign's Overview tab.
2. Expected: a new "Require camera & microphone" row appears in the "Anti-cheat & Security" section, off by default, with the same visual style as the other toggles.
3. Turn it on, click "Save changes" (or whatever the OverviewTab's save action is bound to), reload the page.
4. Expected: the toggle is still on after reload (persisted).

- [ ] **Step 8: Commit**

```bash
git add app/admin/campaigns/[id]/page.tsx
git commit -m "feat(admin): add camera/mic requirement toggle to campaign overview"
```

---

### Task 6: Candidate-facing API routes — expose `antiCheatCamera`

**Files:**
- Modify: `app/api/candidate/campaign-config/route.ts:12-25`
- Modify: `app/api/candidate/instructions/route.ts:14-30,44-53`

**Interfaces:**
- Consumes: `Campaign.antiCheatCamera` (Task 1).
- Produces: `GET /api/candidate/campaign-config` response includes `antiCheatCamera: boolean`. `GET /api/candidate/instructions` response's `campaign.antiCheat.camera: boolean`. Consumed by Task 7 (instructions page) and Task 9 (exam page).

- [ ] **Step 1: Add to the campaign-config select**

In `app/api/candidate/campaign-config/route.ts`, replace:

```ts
        campaign: {
          select: {
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
          },
        },
```

with:

```ts
        campaign: {
          select: {
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
            antiCheatCamera: true,
          },
        },
```

No change needed to the response body below it — it already does `...candidate.campaign`, which will now include `antiCheatCamera`.

- [ ] **Step 2: Add to the instructions select and response**

In `app/api/candidate/instructions/route.ts`, replace:

```ts
        campaign: {
          select: {
            name: true,
            durationSec: true,
            instructionsHtml: true,
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
            disqualifyOnDuplicateLogin: true,
            _count: { select: { questions: true } },
          },
        },
```

with:

```ts
        campaign: {
          select: {
            name: true,
            durationSec: true,
            instructionsHtml: true,
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
            antiCheatCamera: true,
            disqualifyOnDuplicateLogin: true,
            _count: { select: { questions: true } },
          },
        },
```

Then replace:

```ts
        antiCheat: {
          tabSwitch: candidate.campaign.antiCheatTabSwitch,
          tabSwitchLimit: candidate.campaign.tabSwitchLimit,
          fullscreen: candidate.campaign.antiCheatFullscreen,
          copyPaste: candidate.campaign.antiCheatCopyPaste,
          rightClick: candidate.campaign.antiCheatRightClick,
          screenshot: candidate.campaign.antiCheatScreenshot,
          devTools: candidate.campaign.antiCheatDevTools,
          duplicateLogin: candidate.campaign.disqualifyOnDuplicateLogin,
        },
```

with:

```ts
        antiCheat: {
          tabSwitch: candidate.campaign.antiCheatTabSwitch,
          tabSwitchLimit: candidate.campaign.tabSwitchLimit,
          fullscreen: candidate.campaign.antiCheatFullscreen,
          copyPaste: candidate.campaign.antiCheatCopyPaste,
          rightClick: candidate.campaign.antiCheatRightClick,
          screenshot: candidate.campaign.antiCheatScreenshot,
          devTools: candidate.campaign.antiCheatDevTools,
          camera: candidate.campaign.antiCheatCamera,
          duplicateLogin: candidate.campaign.disqualifyOnDuplicateLogin,
        },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify**

The candidate's auth token lives only in an in-memory module variable (`lib/auth-store.ts`), not `localStorage`/`sessionStorage`, so it can't be read from a fresh DevTools console line — instead, inspect the requests the page already makes:

1. Log in as a candidate for a campaign where you set `antiCheatCamera: true` in Task 5.
2. Open DevTools → Network tab, filter by `Fetch/XHR`, before navigating to the instructions page.
3. Load `/candidate/instructions`. Find the `instructions` request in the Network tab, open its Response tab.
   Expected: `campaign.antiCheat.camera === true`.
4. Continue to `/candidate/exam`. Find the `campaign-config` request, open its Response tab.
   Expected: `antiCheatCamera: true` is present in the response body.
5. Toggle "Require camera & microphone" off in the admin Overview tab, repeat with a fresh candidate session, and confirm both responses now show `false`.

- [ ] **Step 5: Commit**

```bash
git add app/api/candidate/campaign-config/route.ts app/api/candidate/instructions/route.ts
git commit -m "feat(api): expose antiCheatCamera to candidate-facing endpoints"
```

---

### Task 7: Instructions page — camera/mic rule

**Files:**
- Modify: `app/candidate/instructions/page.tsx:8-17,98-113`

**Interfaces:**
- Consumes: `GET /api/candidate/instructions` response's `campaign.antiCheat.camera: boolean` (Task 6).

- [ ] **Step 1: Add `camera` to the local `AntiCheat` interface**

Replace:

```ts
interface AntiCheat {
  tabSwitch: boolean;
  tabSwitchLimit: number;
  fullscreen: boolean;
  copyPaste: boolean;
  rightClick: boolean;
  screenshot: boolean;
  devTools: boolean;
  duplicateLogin: boolean;
}
```

with:

```ts
interface AntiCheat {
  tabSwitch: boolean;
  tabSwitchLimit: number;
  fullscreen: boolean;
  copyPaste: boolean;
  rightClick: boolean;
  screenshot: boolean;
  devTools: boolean;
  camera: boolean;
  duplicateLogin: boolean;
}
```

- [ ] **Step 2: Add the rule bullet**

Replace:

```ts
  if (ac.devTools) rules.push("Browser developer tools are blocked during the exam.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
```

with:

```ts
  if (ac.devTools) rules.push("Browser developer tools are blocked during the exam.");
  if (ac.camera) rules.push("You must allow camera and microphone access, and keep it on, for the entire exam.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify**

1. Run: `npm run dev`, log in as a candidate for a campaign with `antiCheatCamera: true` (set via Task 5's Overview tab), reach the instructions page.
2. Expected: the anti-cheat rules list includes "You must allow camera and microphone access, and keep it on, for the entire exam."
3. Turn the toggle off for the campaign, reload the instructions page (or log in as a fresh candidate on that campaign).
4. Expected: the bullet is gone.

- [ ] **Step 5: Commit**

```bash
git add app/candidate/instructions/page.tsx
git commit -m "feat(instructions): show camera/mic requirement rule when enabled"
```

---

### Task 8: `CameraSelfView` component

**Files:**
- Create: `components/exam/CameraSelfView.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — a standalone presentational component.
- Produces: `export default function CameraSelfView({ stream }: { stream: MediaStream })`. Consumed by Task 9.

- [ ] **Step 1: Create the component**

```tsx
// components/exam/CameraSelfView.tsx
"use client";

import { useEffect, useRef } from "react";

interface CameraSelfViewProps {
  stream: MediaStream;
}

export default function CameraSelfView({ stream }: CameraSelfViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const micLive = stream.getAudioTracks()[0]?.readyState === "live";

  return (
    <div className="fixed bottom-4 right-4 z-40 w-32 overflow-hidden rounded-lg border-2 border-gray-700 bg-black shadow-lg sm:w-40">
      <video ref={videoRef} autoPlay muted playsInline className="block h-full w-full object-cover" />
      <div className="absolute bottom-1 right-1 flex items-center rounded-full bg-black/60 px-1.5 py-1">
        <span
          className={`h-1.5 w-1.5 rounded-full ${micLive ? "bg-emerald-400" : "bg-red-500"}`}
          title={micLive ? "Microphone active" : "Microphone unavailable"}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint components/exam/CameraSelfView.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/exam/CameraSelfView.tsx
git commit -m "feat(exam): add CameraSelfView presence-check thumbnail component"
```

---

### Task 9: Exam page — request, monitor, and enforce camera/mic

**Files:**
- Modify: `app/candidate/exam/page.tsx`

**Interfaces:**
- Consumes: `AssessmentSettings.antiCheatCamera` (Task 3), `/api/candidate/campaign-config`'s `antiCheatCamera` field (Task 6), `CameraSelfView` (Task 8).
- Produces: nothing consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Import `CameraSelfView`**

Replace:

```tsx
import QuestionProgress from "@/components/exam/QuestionProgress";
```

with:

```tsx
import QuestionProgress from "@/components/exam/QuestionProgress";
import CameraSelfView from "@/components/exam/CameraSelfView";
```

- [ ] **Step 2: Add camera state and a stream ref**

Replace:

```tsx
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
```

with:

```tsx
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
  const [cameraRequired, setCameraRequired] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraWarning, setCameraWarning] = useState(false);
```

Replace:

```tsx
  // Set to true once campaign config has loaded — triggers fullscreen request
  const configLoadedRef = useRef(false);
```

with:

```tsx
  // Set to true once campaign config has loaded — triggers fullscreen request
  const configLoadedRef = useRef(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
```

- [ ] **Step 3: Hoist `handleTabSwitch` out of the anti-cheat effect so the camera code can reuse it**

Replace the existing "Timer expired" callback block:

```tsx
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
```

with (adds `handleTabSwitch` and `requestCamera` right after it, still before the "Initial load" effect):

```tsx
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
  const handleTabSwitch = useCallback(async () => {
    if (!settingsRef.current.antiCheatTabSwitch) return;
    const socket = getSocket();
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
      setTabSwitchInfo({ count: data.count, limit: data.limit });
    } catch {
      // network error — still emit socket event so admin can see it
    }
    socket.emit(SocketEvents.TAB_SWITCH);
  }, [router]);

  // Request camera/mic access; used both for the initial grant and the
  // "Grant access" retry button after a denial or a dropped track.
  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStreamRef.current = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          setCameraActive(false);
          setCameraWarning(true);
          handleTabSwitch();
        };
      });
      setCameraActive(true);
      setCameraWarning(false);
    } catch {
      setCameraActive(false);
      setCameraWarning(true);
    }
  }, [handleTabSwitch]);
```

- [ ] **Step 4: Trigger the camera request from the initial-load effect**

Replace:

```tsx
      .then((data) => {
        settingsRef.current = { ...SETTINGS_DEFAULTS, ...data };
        configLoadedRef.current = true;
        if (settingsRef.current.antiCheatFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      })
      .catch(() => {});
```

with:

```tsx
      .then((data) => {
        settingsRef.current = { ...SETTINGS_DEFAULTS, ...data };
        configLoadedRef.current = true;
        if (settingsRef.current.antiCheatFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        if (settingsRef.current.antiCheatCamera) {
          setCameraRequired(true);
          requestCamera();
        }
      })
      .catch(() => {});
```

- [ ] **Step 5: Stop camera tracks on unmount**

Replace:

```tsx
    return () => {
      mountedRef.current = false;
      if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(this is the return of the "Initial load" `useEffect`) with:

```tsx
    return () => {
      mountedRef.current = false;
      if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 6: Remove the now-duplicate `handleTabSwitch` definition from the anti-cheat effect**

`const socket = getSocket();` at the top of this effect must stay — `onBeforeUnload` further down in the same effect still uses it (`socket.emit(SocketEvents.PAGE_REFRESH)`). Only the `handleTabSwitch` function itself is being removed, since it now lives at component scope (Step 3).

Replace:

```tsx
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
        setTabSwitchInfo({ count: data.count, limit: data.limit });
      } catch {
        // network error — still emit socket event so admin can see it
      }
      socket.emit(SocketEvents.TAB_SWITCH);
    };

    const onVisibilityChange = () => {
```

with:

```tsx
  useEffect(() => {
    const socket = getSocket();

    const onVisibilityChange = () => {
```

And update the effect's dependency array — replace:

```tsx
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [router]);
```

with:

```tsx
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [router, handleTabSwitch]);
```

- [ ] **Step 7: Render the blocking overlay and the self-view thumbnail**

Replace:

```tsx
      {showWarning && (
        <TabSwitchModal
          count={tabSwitchInfo.count}
          limit={tabSwitchInfo.limit}
          onClose={() => setShowWarning(false)}
        />
      )}
      <BroadcastToast message={broadcastMsg} onDismiss={clearBroadcast} />
```

with:

```tsx
      {cameraWarning && (
        <div className="fixed inset-0 z-[9997] flex flex-col items-center justify-center gap-4 bg-black/90">
          <svg className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-lg font-semibold text-white">Camera &amp; microphone access required</p>
          <p className="text-sm text-gray-400">This assessment requires your camera and microphone to stay on for the entire exam.</p>
          <button
            type="button"
            onClick={requestCamera}
            className="mt-2 rounded-lg bg-[#6366F1] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4F46E5]"
          >
            Grant camera &amp; microphone access
          </button>
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
      {cameraRequired && cameraActive && cameraStreamRef.current && (
        <CameraSelfView stream={cameraStreamRef.current} />
      )}
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/candidate/exam/page.tsx`
Expected: no new errors (the pre-existing unrelated `react-hooks/exhaustive-deps` warning noted in Task 2 may still appear).

- [ ] **Step 9: Manually verify in the browser**

1. Run: `npm run dev`. In `/admin/campaigns/<id>` Overview tab, turn on "Require camera & microphone" and save.
2. Log in as a candidate for that campaign, get through the instructions page, reach the exam.
3. The browser will prompt for camera/microphone permission. Click **Allow**.
   - Expected: a small self-view video thumbnail appears bottom-right, with a green dot (mic live), and no blocking overlay.
4. Click **Deny** on a fresh candidate session (or test in a private window) instead of Allow.
   - Expected: the full-screen "Camera & microphone access required" overlay appears immediately, blocking the exam. Clicking "Grant camera & microphone access" re-prompts; allowing this time clears the overlay and shows the thumbnail.
5. With access granted, open the browser's camera/mic indicator (e.g. Chrome's tab/URL-bar camera icon) and click "Stop sharing" or revoke the permission.
   - Expected: the blocking overlay reappears (the track's `ended` event fired), and — check the admin's live session view or the candidate's tab-switch count via `/api/candidate/campaign-config` — the violation was logged the same way a tab switch would be (counts toward `tabSwitchCount`, subject to the campaign's `tabSwitchLimit`).
6. Turn the "Require camera & microphone" toggle off for the campaign and start a fresh candidate session.
   - Expected: no permission prompt appears at all, no thumbnail, no overlay — the exam behaves exactly as it did before this feature existed.
7. Repeat the double-question-text regression check from earlier in this project: confirm each question's text still renders exactly once (this task's edits are all above/around the question-rendering JSX, not inside it, but worth a quick look since this is the same file).

- [ ] **Step 10: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "feat(exam): enforce camera/mic presence check, mirroring fullscreen enforcement"
```

---

## Post-plan sanity pass

- [ ] Run `npx tsc --noEmit -p tsconfig.json` once more from a clean state — expect zero errors across the whole plan's changes.
- [ ] Run `npx eslint app components lib` — expect no new errors (pre-existing warnings noted per-task are fine).
- [ ] Create one brand-new campaign end-to-end through the admin UI and confirm every anti-cheat toggle (tab switch, copy/paste, right-click, screenshot, dev tools, camera) starts **off**, and `disqualifyOnDuplicateLogin` starts **on**.
