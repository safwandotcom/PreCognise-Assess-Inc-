# Multi-Display Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can opt a campaign into detecting when a candidate has more than one display connected during the exam; the candidate sees a blocking overlay while it remains connected, every occurrence is logged, and nothing auto-disqualifies.

**Architecture:** Follows the exact plumbing the `antiCheatCamera` field already established end-to-end (schema → PATCH route → Overview tab toggle → campaign-config/instructions routes → instructions page → exam page), but with a deliberately simpler enforcement model than camera: no strike limit, no disqualification path anywhere in this feature — just detect, block until resolved, and log. Detection uses `window.screen.isExtended` (no permission prompt, Chromium-only) polled on an interval, since there's no permission-free change event to subscribe to.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Prisma + Postgres (applied via `prisma db push`, not `migrate dev` — see Global Constraints), Tailwind CSS. No new dependency — `window.screen.isExtended` is a browser-native Web API.

## Global Constraints

- No unit/integration test framework exists in this Next.js app (confirmed repeatedly this session: no jest/vitest config, no `*.test.*` files under `app/`, `components/`, `lib/`). Every task's verification step is `npx tsc --noEmit` + `npx eslint <changed files>`, not automated tests.
- **Never run `npx prisma migrate dev` against this database.** It has pre-existing schema drift outside its migration history (from earlier work applied via `db push`), and `migrate dev` will detect that drift and offer a destructive `prisma migrate reset` that drops all data. Use `npx prisma db push` for the schema task. This has happened once already this session (see commit `7713fb4`) and was resolved with explicit user sign-off; the same constraint applies here without needing to re-litigate it.
- No auto-disqualification anywhere in this feature. This is the one explicit way this feature differs from the camera feature it's modeled on — do not copy camera's `CandidateStatus.DISQUALIFIED` / strike-limit logic.
- Follow the existing per-toggle code pattern exactly (see `antiCheatCamera` for reference in every file it touches) — same shape of state, sync effect, save payload, PATCH destructuring, select clauses, `antiCheatX` → `x` response-key convention.
- `window.screen.isExtended` is `undefined` on unsupported browsers (Firefox, Safari) — when so, skip the entire feature silently for that candidate (no interval started, no warning, no logging). Do not show a "your browser doesn't support this" message; do not block unsupported browsers.
- Dev server: `npm run dev`. No dev server or browser was available to any implementer this session — the manual-verification steps in this plan are written for whoever performs them later (with real dev-server + browser access), not for the implementer subagent to attempt.

---

### Task 1: Prisma schema — add `antiCheatMultiDisplay` and `multiDisplayViolationCount`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Campaign.antiCheatMultiDisplay: boolean` (new `@default(false)` column), `Candidate.multiDisplayViolationCount: number` (new `@default(0)` column). All later tasks that read/write these fields depend on this having run.

- [ ] **Step 1: Add the field to the `Campaign` model**

In `prisma/schema.prisma`, replace:

```prisma
  antiCheatCamera            Boolean        @default(false)
  antiCheatShuffleQuestions  Boolean        @default(false)
```

with:

```prisma
  antiCheatCamera            Boolean        @default(false)
  antiCheatMultiDisplay      Boolean        @default(false)
  antiCheatShuffleQuestions  Boolean        @default(false)
```

- [ ] **Step 2: Add the field to the `Candidate` model**

Replace:

```prisma
  tabSwitchCount       Int             @default(0)
  cameraViolationCount Int             @default(0)
  otpHash              String?
```

with:

```prisma
  tabSwitchCount             Int             @default(0)
  cameraViolationCount       Int             @default(0)
  multiDisplayViolationCount Int             @default(0)
  otpHash                    String?
```

Note the column realignment — `multiDisplayViolationCount` is longer than the other field names in this model, so this replaces the whole block's spacing, not just adds a line. Don't worry about getting the exact spacing right by hand; Step 3 fixes it.

- [ ] **Step 3: Format and apply**

Run: `npx prisma format` — this re-aligns column spacing automatically (same as happened when `cameraViolationCount` was added). Confirm the file's `Candidate` and `Campaign` blocks are consistently column-aligned after this.

Run: `npx prisma db push` (use the PowerShell tool, not Bash — Bash's `node`/`npx` are not on PATH in this environment but PowerShell's are)

Expected output: `Your database is now in sync with your Prisma schema.` followed by `Generated Prisma Client`. **If this instead shows drift detection or offers `prisma migrate reset`, STOP — do not proceed, do not confirm any reset prompt.** That would mean something unexpected changed; report BLOCKED with the exact output.

- [ ] **Step 4: Verify**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (confirms the regenerated Prisma client's `Campaign` and `Candidate` types now include the two new fields).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add antiCheatMultiDisplay and multiDisplayViolationCount fields"
```

---

### Task 2: Shared settings type — add `antiCheatMultiDisplay`

**Files:**
- Modify: `lib/get-settings.ts`

**Interfaces:**
- Produces: `AssessmentSettings.antiCheatMultiDisplay: boolean`, `SETTINGS_DEFAULTS.antiCheatMultiDisplay === false`. Consumed by Task 8 (`app/candidate/exam/page.tsx` reads `settingsRef.current.antiCheatMultiDisplay`).

- [ ] **Step 1: Add the field to the type, defaults, and `getSettings()`'s return**

Replace:

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

with:

```ts
export type AssessmentSettings = {
  antiCheatTabSwitch: boolean;
  antiCheatContextMenu: boolean;
  antiCheatCopyPaste: boolean;
  antiCheatScreenshot: boolean;
  antiCheatDevTools: boolean;
  antiCheatCamera: boolean;
  antiCheatMultiDisplay: boolean;
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
  antiCheatMultiDisplay: false,
  speedBonusEnabled: true,
  gracePeriodSec: 0,
  geoRestriction: "",
  tabSwitchLimit: 3,
  antiCheatFullscreen: false,
  antiCheatRightClick: true,
};
```

Then replace:

```ts
    antiCheatCamera: SETTINGS_DEFAULTS.antiCheatCamera,
    speedBonusEnabled: row.speedBonusEnabled,
```

with:

```ts
    antiCheatCamera: SETTINGS_DEFAULTS.antiCheatCamera,
    antiCheatMultiDisplay: SETTINGS_DEFAULTS.antiCheatMultiDisplay,
    speedBonusEnabled: row.speedBonusEnabled,
```

This mirrors `antiCheatCamera`'s exact treatment in `getSettings()`: hardcoded to the default rather than read from a `row` field, because — like camera — this is campaign-scoped only and not part of the global `AssessmentSettings` Prisma model. **This line is required, not optional** — unlike the camera feature's Task 3 (where the plan wrongly said to omit it and the implementer had to add it anyway), this plan already accounts for the fact that `getSettings()`'s return is a fully-typed object literal, so every field of `AssessmentSettings` must appear in it or `tsc` fails.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/get-settings.ts
git commit -m "feat(exam): add antiCheatMultiDisplay to shared exam settings type"
```

---

### Task 3: Admin PATCH route — accept `antiCheatMultiDisplay`

**Files:**
- Modify: `app/api/admin/campaigns/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma.campaign` client with `antiCheatMultiDisplay: boolean` field (Task 1).
- Produces: `PATCH /api/admin/campaigns/[id]` accepts an optional `antiCheatMultiDisplay: boolean` in its JSON body and persists it. Consumed by Task 4 (Overview tab save payload).

- [ ] **Step 1: Destructure the new field**

Replace:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
```

with:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatMultiDisplay, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
```

- [ ] **Step 2: Apply it in the update data object**

Replace:

```ts
        ...(antiCheatCamera !== undefined && { antiCheatCamera }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
```

with:

```ts
        ...(antiCheatCamera !== undefined && { antiCheatCamera }),
        ...(antiCheatMultiDisplay !== undefined && { antiCheatMultiDisplay }),
        ...(antiCheatShuffleQuestions !== undefined && { antiCheatShuffleQuestions }),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify the route** (deferred if no dev server/browser is available — note this in the report and move on)

1. Run: `npm run dev`. Sign in as admin in a browser (reuses cookie auth, no header needed).
2. In DevTools Console on any `/admin` page:
   ```js
   fetch(`/api/admin/campaigns/<a-real-campaign-id>`, {
     method: "PATCH",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ antiCheatMultiDisplay: true }),
   }).then(r => r.json()).then(console.log)
   ```
3. Expected: response JSON's `campaign.antiCheatMultiDisplay` is `true`. Repeat with `false` to confirm it flips back.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/campaigns/[id]/route.ts
git commit -m "feat(api): accept antiCheatMultiDisplay on campaign PATCH"
```

---

### Task 4: Admin Overview tab — multi-display toggle

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/campaigns/[id]` accepting `antiCheatMultiDisplay` (Task 3).
- Produces: nothing consumed by later tasks — leaf admin-UI piece.

- [ ] **Step 1: Add the field to the `Campaign` interface**

Replace:

```ts
  antiCheatCamera: boolean;
  antiCheatShuffleQuestions: boolean;
```

with:

```ts
  antiCheatCamera: boolean;
  antiCheatMultiDisplay: boolean;
  antiCheatShuffleQuestions: boolean;
```

(in the `interface Campaign { ... }` block, currently at lines 34-64)

- [ ] **Step 2: Add local state in `OverviewTab`**

Replace:

```ts
  const [antiCheatCamera, setAntiCheatCamera] = useState(
    campaign.antiCheatCamera,
  );
  const [antiCheatShuffleQuestions, setAntiCheatShuffleQuestions] = useState(
    campaign.antiCheatShuffleQuestions,
  );
```

with:

```ts
  const [antiCheatCamera, setAntiCheatCamera] = useState(
    campaign.antiCheatCamera,
  );
  const [antiCheatMultiDisplay, setAntiCheatMultiDisplay] = useState(
    campaign.antiCheatMultiDisplay,
  );
  const [antiCheatShuffleQuestions, setAntiCheatShuffleQuestions] = useState(
    campaign.antiCheatShuffleQuestions,
  );
```

- [ ] **Step 3: Sync the new state when `campaign` reloads**

Replace:

```ts
    setAntiCheatCamera(campaign.antiCheatCamera);
    setAntiCheatShuffleQuestions(campaign.antiCheatShuffleQuestions);
```

with:

```ts
    setAntiCheatCamera(campaign.antiCheatCamera);
    setAntiCheatMultiDisplay(campaign.antiCheatMultiDisplay);
    setAntiCheatShuffleQuestions(campaign.antiCheatShuffleQuestions);
```

- [ ] **Step 4: Include it in the save payload**

Replace:

```ts
          antiCheatCamera,
          antiCheatShuffleQuestions,
```

with:

```ts
          antiCheatCamera,
          antiCheatMultiDisplay,
          antiCheatShuffleQuestions,
```

- [ ] **Step 5: Add the toggle to the Anti-cheat & Security section**

Replace:

```tsx
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatCamera ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Shuffle question order */}
```

with:

```tsx
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatCamera ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Detect multiple displays */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Detect multiple displays
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Warn and log when more than one display is connected during the exam. Does not automatically disqualify — the candidate can resolve it by disconnecting the extra display.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={antiCheatMultiDisplay}
                  onClick={() => setAntiCheatMultiDisplay((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    antiCheatMultiDisplay ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      antiCheatMultiDisplay ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Shuffle question order */}
```

Note: the `antiCheatCamera ? "translate-x-6" : "translate-x-1"` line is specific to the camera toggle's own button (every toggle references its own variable name there), so this whole block is unique in the file — no ambiguity with any other toggle.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/admin/campaigns/[id]/page.tsx`
Expected: no new errors (this file has pre-existing, unrelated `react-hooks/set-state-in-effect` and `react/no-unescaped-entities` errors at lines ~254/1398/1913/1936/2330/2334 confirmed outside any of this session's diffs — not your concern, do not fix them).

- [ ] **Step 7: Manually verify in the browser** (deferred if unavailable — note in report)

1. Open any campaign's Overview tab. Expected: a "Detect multiple displays" row appears in "Anti-cheat & Security", off by default, directly below "Require camera & microphone."
2. Turn it on, save, reload. Expected: still on.

- [ ] **Step 8: Commit**

```bash
git add app/admin/campaigns/[id]/page.tsx
git commit -m "feat(admin): add multi-display detection toggle to campaign overview"
```

---

### Task 5: Candidate-facing API routes — expose `antiCheatMultiDisplay`

**Files:**
- Modify: `app/api/candidate/campaign-config/route.ts`
- Modify: `app/api/candidate/instructions/route.ts`

**Interfaces:**
- Consumes: `Campaign.antiCheatMultiDisplay` (Task 1).
- Produces: `GET /api/candidate/campaign-config` response includes `antiCheatMultiDisplay: boolean`. `GET /api/candidate/instructions` response's `campaign.antiCheat.multiDisplay: boolean`. Consumed by Task 6 (instructions page) and Task 8 (exam page).

- [ ] **Step 1: Add to the campaign-config select**

In `app/api/candidate/campaign-config/route.ts`, replace:

```ts
            antiCheatDevTools: true,
            antiCheatCamera: true,
          },
        },
      },
    });
```

with:

```ts
            antiCheatDevTools: true,
            antiCheatCamera: true,
            antiCheatMultiDisplay: true,
          },
        },
      },
    });
```

No change needed to the response body below it — it already does `...candidate.campaign`, which will now include `antiCheatMultiDisplay`.

- [ ] **Step 2: Add to the instructions select and response**

In `app/api/candidate/instructions/route.ts`, replace:

```ts
            antiCheatDevTools: true,
            antiCheatCamera: true,
            disqualifyOnDuplicateLogin: true,
```

with:

```ts
            antiCheatDevTools: true,
            antiCheatCamera: true,
            antiCheatMultiDisplay: true,
            disqualifyOnDuplicateLogin: true,
```

Then replace:

```ts
          camera: candidate.campaign.antiCheatCamera,
          duplicateLogin: candidate.campaign.disqualifyOnDuplicateLogin,
```

with:

```ts
          camera: candidate.campaign.antiCheatCamera,
          multiDisplay: candidate.campaign.antiCheatMultiDisplay,
          duplicateLogin: candidate.campaign.disqualifyOnDuplicateLogin,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify** (deferred if unavailable — note in report)

Same Network-tab approach as the camera feature's equivalent task: log in as a candidate for a campaign with `antiCheatMultiDisplay: true` (set via Task 4), check the `instructions` and `campaign-config` requests' response bodies in DevTools → Network for the new field.

- [ ] **Step 5: Commit**

```bash
git add app/api/candidate/campaign-config/route.ts app/api/candidate/instructions/route.ts
git commit -m "feat(api): expose antiCheatMultiDisplay to candidate-facing endpoints"
```

---

### Task 6: Instructions page — multi-display rule

**Files:**
- Modify: `app/candidate/instructions/page.tsx`

**Interfaces:**
- Consumes: `GET /api/candidate/instructions` response's `campaign.antiCheat.multiDisplay: boolean` (Task 5).

- [ ] **Step 1: Add `multiDisplay` to the local `AntiCheat` interface**

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
  camera: boolean;
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
  multiDisplay: boolean;
  duplicateLogin: boolean;
}
```

- [ ] **Step 2: Add the rule bullet**

Replace:

```ts
  if (ac.camera) rules.push("You must allow camera and microphone access, and keep it on, for the entire exam — 3 failed attempts to grant access will disqualify you.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
```

with:

```ts
  if (ac.camera) rules.push("You must allow camera and microphone access, and keep it on, for the entire exam — 3 failed attempts to grant access will disqualify you.");
  if (ac.multiDisplay) rules.push("Using more than one display or monitor during the exam is not allowed. It will be detected and logged, but will not disqualify you automatically — disconnect any extra display before continuing.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manually verify** (deferred if unavailable — note in report)

Log in as a candidate for a campaign with `antiCheatMultiDisplay: true`, confirm the rule appears on the instructions page; toggle off, confirm it's gone.

- [ ] **Step 5: Commit**

```bash
git add app/candidate/instructions/page.tsx
git commit -m "feat(instructions): show multi-display detection rule when enabled"
```

---

### Task 7: New API route — `/api/candidate/multi-display-violation`

**Files:**
- Create: `app/api/candidate/multi-display-violation/route.ts`

**Interfaces:**
- Consumes: `Candidate.multiDisplayViolationCount` (Task 1).
- Produces: `POST /api/candidate/multi-display-violation` — increments the count, returns `{ count }`. Consumed by Task 8.

- [ ] **Step 1: Create the route**

Model this closely on the existing `app/api/candidate/camera-violation/route.ts` (read it first), but **simpler — no limit, no disqualify branch**, per this feature's explicit no-auto-disqualify design:

```ts
// app/api/candidate/multi-display-violation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { multiDisplayViolationCount: true },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newCount = candidate.multiDisplayViolationCount + 1;
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { multiDisplayViolationCount: newCount },
    });

    return NextResponse.json({ count: newCount });
  } catch (err) {
    console.error("POST /api/candidate/multi-display-violation error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/api/candidate/multi-display-violation/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/candidate/multi-display-violation/route.ts
git commit -m "feat(api): add multi-display violation logging endpoint"
```

---

### Task 8: Exam page — detect, block, and log

**Files:**
- Modify: `app/candidate/exam/page.tsx`

**Interfaces:**
- Consumes: `AssessmentSettings.antiCheatMultiDisplay` (Task 2), `/api/candidate/campaign-config`'s `antiCheatMultiDisplay` field (Task 5), `POST /api/candidate/multi-display-violation` (Task 7).
- Produces: nothing consumed elsewhere — final integration point for this feature.

- [ ] **Step 1: Add state and a one-shot latch ref**

Replace:

```tsx
  const [cameraAttempts, setCameraAttempts] = useState({ count: 0, limit: 3 });
```

with:

```tsx
  const [cameraAttempts, setCameraAttempts] = useState({ count: 0, limit: 3 });
  const [multiDisplayWarning, setMultiDisplayWarning] = useState(false);
```

Replace:

```tsx
  // Latches once a track-drop violation has been reported for the current
  // grant, so onended (which side-effects via fetch/router — kept out of any
  // setState updater, which React may invoke more than once) reports once.
  const cameraDropReportedRef = useRef(false);
```

with:

```tsx
  // Latches once a track-drop violation has been reported for the current
  // grant, so onended (which side-effects via fetch/router — kept out of any
  // setState updater, which React may invoke more than once) reports once.
  const cameraDropReportedRef = useRef(false);
  // Latches once the current multi-display occurrence has been reported, so
  // a poll tick that finds isExtended still true doesn't re-report every
  // interval. Reset to false when isExtended goes back to false, so a later
  // reconnect counts as a new occurrence.
  const multiDisplayReportedRef = useRef(false);
```

- [ ] **Step 2: Add the violation reporter**

Replace the existing `requestCamera` callback's closing brace and the blank line after it:

```tsx
    } catch {
      setCameraActive(false);
      setCameraWarning(true);
      reportCameraViolation();
    }
  }, [reportCameraViolation]);

  // Initial load — settings and first question in parallel
```

with:

```tsx
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
      await fetch("/api/candidate/multi-display-violation", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
    } catch {
      // network error — overlay still reflects live isExtended state via polling
    }
  }, []);

  // Initial load — settings and first question in parallel
```

- [ ] **Step 3: Start the poll when the campaign requires it**

Replace:

```tsx
        if (settingsRef.current.antiCheatCamera) {
          setCameraRequired(true);
          requestCamera();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNext();
    return () => {
      mountedRef.current = false;
      if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

with:

```tsx
        if (settingsRef.current.antiCheatCamera) {
          setCameraRequired(true);
          requestCamera();
        }
        if (
          settingsRef.current.antiCheatMultiDisplay &&
          typeof window.screen.isExtended === "boolean"
        ) {
          multiDisplayIntervalRef.current = setInterval(() => {
            const extended = window.screen.isExtended;
            if (extended) {
              setMultiDisplayWarning(true);
              if (!multiDisplayReportedRef.current) {
                multiDisplayReportedRef.current = true;
                reportMultiDisplayViolation();
              }
            } else {
              setMultiDisplayWarning(false);
              multiDisplayReportedRef.current = false;
            }
          }, 4000);
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
```

This references `multiDisplayIntervalRef` and `reportMultiDisplayViolation`, both defined in earlier steps of this same task — the effect body doesn't need them in its dependency array since it intentionally runs once on mount (matching the existing `// eslint-disable-next-line react-hooks/exhaustive-deps` pattern already on this effect for the same reason `requestCamera`/`fetchNext` aren't in its deps either).

Add the ref itself — replace:

```tsx
  const cameraStreamRef = useRef<MediaStream | null>(null);
```

with:

```tsx
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const multiDisplayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 4: Render the blocking overlay**

Replace:

```tsx
      {showWarning && (
        <TabSwitchModal
```

with:

```tsx
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
```

Note there is deliberately no button here — unlike the camera/fullscreen overlays, this one clears itself automatically on the next poll tick once `window.screen.isExtended` goes back to `false`, since re-checking is a cheap synchronous read rather than a fresh permission request the candidate needs to trigger.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (This step also validates `window.screen.isExtended` is a recognized TypeScript API — if `tsc` reports it as unknown, the project's `lib` target in `tsconfig.json` may need `"DOM"` confirmed present, but this is expected to already be satisfied since the file already uses many other DOM APIs like `document.fullscreenElement`. If it does error, report BLOCKED with the exact message rather than guessing a `tsconfig.json` change.)

Run: `npx eslint app/candidate/exam/page.tsx`
Expected: no new errors (pre-existing unused-`eslint-disable` warning around line 308 is expected, not a regression).

- [ ] **Step 6: Manually verify in the browser** (deferred if unavailable — note in report; if you have access to a machine with two displays, this is worth doing properly rather than deferring)

1. Enable "Detect multiple displays" for a campaign, start an exam session on a machine with a second display connected.
2. Expected: within ~4 seconds, the "Extra display detected" overlay appears, blocking the exam.
3. Disconnect the second display (or, in Chrome DevTools, there's no reliable emulation for `screen.isExtended` — a real multi-monitor setup is the only way to test this meaningfully).
4. Expected: within ~4 seconds of reconnecting single-display, the overlay clears on its own with no button click needed.
5. Check `/api/candidate/multi-display-violation` was called (Network tab) each time the overlay first appeared, not on every 4-second tick while it stayed up.
6. On a single-display machine or Firefox/Safari, confirm nothing happens at all — no interval, no overlay, no requests to the new endpoint.

- [ ] **Step 7: Commit**

```bash
git add app/candidate/exam/page.tsx
git commit -m "feat(exam): detect and block on multiple connected displays"
```

---

### Task 9: Admin results page — show violation count

**Files:**
- Modify: `app/api/admin/campaigns/[id]/results/route.ts`
- Modify: `app/admin/campaigns/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `Candidate.multiDisplayViolationCount` (Task 1).
- Produces: nothing consumed elsewhere — leaf admin-UI piece.

- [ ] **Step 1: Select the new field**

In `app/api/admin/campaigns/[id]/results/route.ts`, replace:

```ts
        status: true,
        tabSwitchCount: true,
        disqualifyReason: true,
```

with:

```ts
        status: true,
        tabSwitchCount: true,
        multiDisplayViolationCount: true,
        disqualifyReason: true,
```

- [ ] **Step 2: Include it in the aggregated response object**

Replace:

```ts
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        disqualifyReason: c.disqualifyReason,
```

with:

```ts
        status: c.status,
        tabSwitchCount: c.tabSwitchCount,
        multiDisplayViolationCount: c.multiDisplayViolationCount,
        disqualifyReason: c.disqualifyReason,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit the API change**

```bash
git add app/api/admin/campaigns/[id]/results/route.ts
git commit -m "feat(api): include multiDisplayViolationCount in campaign results"
```

- [ ] **Step 5: Add the field to the results page's types**

In `app/admin/campaigns/[id]/results/page.tsx`, replace:

```ts
  status: string;
  tabSwitchCount: number;
  disqualifyReason: string | null;
```

with:

```ts
  status: string;
  tabSwitchCount: number;
  multiDisplayViolationCount: number;
  disqualifyReason: string | null;
```

- [ ] **Step 6: Add it to the CSV export**

Replace:

```ts
  const header =
    "Rank,Name,Access ID,Email,Score,Max Score,Correct,Total Questions,Answered,Status,Tab Switches,Disqualify Reason";
  const rows = candidates.map((c) =>
    [
      c.rank,
      `"${c.name.replace(/"/g, '""')}"`,
      c.accessId,
      c.email,
      c.totalScore,
      maxPossibleScore,
      c.correctCount,
      totalQuestions,
      c.answeredCount,
      c.status,
      c.tabSwitchCount,
      c.disqualifyReason ? `"${c.disqualifyReason.replace(/"/g, '""')}"` : "",
    ].join(",")
  );
```

with:

```ts
  const header =
    "Rank,Name,Access ID,Email,Score,Max Score,Correct,Total Questions,Answered,Status,Tab Switches,Multi-Display Violations,Disqualify Reason";
  const rows = candidates.map((c) =>
    [
      c.rank,
      `"${c.name.replace(/"/g, '""')}"`,
      c.accessId,
      c.email,
      c.totalScore,
      maxPossibleScore,
      c.correctCount,
      totalQuestions,
      c.answeredCount,
      c.status,
      c.tabSwitchCount,
      c.multiDisplayViolationCount,
      c.disqualifyReason ? `"${c.disqualifyReason.replace(/"/g, '""')}"` : "",
    ].join(",")
  );
```

- [ ] **Step 7: Add the table column**

Replace:

```tsx
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Tab Switches</th>
                </tr>
```

with:

```tsx
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Tab Switches</th>
                  <th className="px-5 py-3 text-left">Multi-Display</th>
                </tr>
```

Replace:

```tsx
                        {/* Tab switches */}
                        <td className="px-5 py-3">
                          <span
                            className={`text-sm font-medium ${
                              c.tabSwitchCount > 0
                                ? "text-amber-600"
                                : "text-[#64748B]"
                            }`}
                          >
                            {c.tabSwitchCount}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
```

with:

```tsx
                        {/* Tab switches */}
                        <td className="px-5 py-3">
                          <span
                            className={`text-sm font-medium ${
                              c.tabSwitchCount > 0
                                ? "text-amber-600"
                                : "text-[#64748B]"
                            }`}
                          >
                            {c.tabSwitchCount}
                          </span>
                        </td>

                        {/* Multi-display violations */}
                        <td className="px-5 py-3">
                          <span
                            className={`text-sm font-medium ${
                              c.multiDisplayViolationCount > 0
                                ? "text-amber-600"
                                : "text-[#64748B]"
                            }`}
                          >
                            {c.multiDisplayViolationCount}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx eslint app/admin/campaigns/[id]/results/page.tsx`
Expected: no new errors.

- [ ] **Step 9: Manually verify in the browser** (deferred if unavailable — note in report)

1. Open a campaign's results page. Expected: a new "Multi-Display" column appears after "Tab Switches", showing `0` in gray for every candidate (no data yet).
2. Export CSV. Expected: `Multi-Display Violations` column present, positioned between `Tab Switches` and `Disqualify Reason`.

- [ ] **Step 10: Commit**

```bash
git add app/admin/campaigns/[id]/results/page.tsx
git commit -m "feat(admin): show multi-display violation count in results table and CSV"
```

---

## Post-plan sanity pass

- [ ] Run `npx tsc --noEmit -p tsconfig.json` once more from a clean state — expect zero errors across the whole plan's changes.
- [ ] Run `npx eslint app api components lib` — expect no new errors (the pre-existing errors in `app/admin/campaigns/[id]/page.tsx` noted in Task 4 are fine).
- [ ] On a real dev server with a two-monitor machine, walk through Task 8's manual verification end-to-end — this is the one piece of this feature that categorically cannot be confirmed by type-checking alone.
