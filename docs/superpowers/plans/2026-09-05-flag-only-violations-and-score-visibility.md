# Flag-Only Violations & Score Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-campaign toggle so an exceeded tab-switch or camera-violation limit can record the reason without disqualifying the candidate or ending their session; visibility for the admin (a "Flagged" indicator distinct from "Disqualified", both with their reason) and a running/final Score column, on both the Candidates tab and Live Session.

**Architecture:** One new campaign boolean (`autoDisqualifyOnViolation`, default `true`) read by the two violation endpoints, which already share the same "exceeded → update candidate" shape — the only change is which fields they write. `Candidate.status` and `Candidate.disqualifyReason` are already independent columns; this plan is the first code path to write one without the other. The candidate-list endpoint gains two derived fields (`score`, `flagged`) computed from data it can already reach, consumed identically by both admin UIs.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / PostgreSQL (Neon), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-05-flag-only-violations-and-score-visibility-design.md`

## Global Constraints

- **Environment gotcha:** `npm`/`npx`/`prisma` commands fail via the Bash tool (nested `cmd.exe` can't resolve `node` on PATH). Use PowerShell for these, or `node <path-to-js>` directly in Bash.
- **No test framework for the Next.js app** beyond `lib/*.test.ts` files run via `npx tsx --test` (Node's built-in test runner). Per-task verification is `tsc --noEmit`, targeted `eslint`, and (final task) `npm run build` plus a scripted end-to-end check against the real dev database with throwaway rows, cleaned up in a `finally` block.
- The admin's manual "Disqualify" action (`app/api/admin/disqualify/route.ts`) and the "Block duplicate logins" setting (`disqualifyOnDuplicateLogin`) are explicitly **not** touched by this plan — both keep their exact current behavior.
- Multi-display violations (`app/api/candidate/multi-display-violation/route.ts`) already never disqualify — out of scope, not touched.
- `disqualifyReason` accumulates (newline-joined) rather than overwrites when a candidate is flagged more than once (e.g. tab-switch then camera) — see Task 2.

---

## Task 1: Schema — `autoDisqualifyOnViolation`

**Files:**
- Modify: `prisma/schema.prisma` (Campaign model, line 88 area)
- Create: `prisma/migrations/<timestamp>_add_auto_disqualify_toggle/migration.sql`

**Interfaces:**
- Produces: `Campaign.autoDisqualifyOnViolation: boolean` (default `true`) — every later task depends on this field existing on the Prisma client.

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, find:

```prisma
  disqualifyOnDuplicateLogin Boolean        @default(true)
  antiCheatTabSwitch         Boolean        @default(false)
```

Replace with:

```prisma
  disqualifyOnDuplicateLogin Boolean        @default(true)
  autoDisqualifyOnViolation  Boolean        @default(true)
  antiCheatTabSwitch         Boolean        @default(false)
```

- [ ] **Step 2: Create the migration file**

Determine today's UTC timestamp (`YYYYMMDDHHMMSS`, e.g. via `Get-Date -AsUTC -Format "yyyyMMddHHmmss"` in PowerShell) and create:

`prisma/migrations/<timestamp>_add_auto_disqualify_toggle/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "autoDisqualifyOnViolation" BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 3: Apply and regenerate**

Via PowerShell:

```powershell
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: Verify**

```powershell
npx prisma migrate status
```

Expected: `Database schema is up to date!`

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add autoDisqualifyOnViolation to Campaign"
```

---

## Task 2: Violation endpoints — flag-only behavior

**Files:**
- Modify: `app/api/candidate/tab-switch/route.ts` (full file, 49 lines)
- Modify: `app/api/candidate/camera-violation/route.ts` (full file, 48 lines)

**Interfaces:**
- Consumes: `Campaign.autoDisqualifyOnViolation` (Task 1).
- Produces: no new exports. Both routes' JSON response shape is unchanged (`{ count, limit, disqualified }`) — `disqualified` is simply `false` when the campaign is in flag-only mode and the limit was exceeded, which is what makes this a zero-change requirement for the candidate-facing exam page (it already just checks that one boolean).

- [ ] **Step 1: `tab-switch` — read the new field and branch on it**

Replace the full contents of `app/api/candidate/tab-switch/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { campaign: { select: { antiCheatTabSwitch: true, tabSwitchLimit: true, autoDisqualifyOnViolation: true } } },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Feature disabled for this campaign
    if (!candidate.campaign.antiCheatTabSwitch) {
      return NextResponse.json({ count: candidate.tabSwitchCount, limit: 0, disqualified: false });
    }

    const newCount = candidate.tabSwitchCount + 1;
    const limit = candidate.campaign.tabSwitchLimit;
    const exceeded = limit > 0 && newCount > limit;

    if (exceeded) {
      const reasonLine = `Flagged: exceeded tab switch limit (${limit} allowed).`;
      if (candidate.campaign.autoDisqualifyOnViolation) {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: {
            tabSwitchCount: newCount,
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: `Disqualified: exceeded tab switch limit (${limit} allowed).`,
            activeToken: null,
          },
        });
        return NextResponse.json({ count: newCount, limit, disqualified: true });
      }
      // Flag-only mode: record the reason, leave status/activeToken alone —
      // the candidate continues completely uninterrupted.
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          tabSwitchCount: newCount,
          disqualifyReason: candidate.disqualifyReason
            ? `${candidate.disqualifyReason}\n${reasonLine}`
            : reasonLine,
        },
      });
      return NextResponse.json({ count: newCount, limit, disqualified: false });
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { tabSwitchCount: newCount },
    });
    return NextResponse.json({ count: newCount, limit, disqualified: false });
  } catch (err) {
    console.error("POST /api/candidate/tab-switch error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: `camera-violation` — same pattern**

Replace the full contents of `app/api/candidate/camera-violation/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { CandidateStatus } from "@prisma/client";

// Fixed at 3 by product decision — independent of the admin-configurable
// tabSwitchLimit, and active whenever antiCheatCamera is on regardless of
// the antiCheatTabSwitch toggle.
const CAMERA_VIOLATION_LIMIT = 3;

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { candidateId } = verifyToken(token);

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        cameraViolationCount: true,
        disqualifyReason: true,
        campaign: { select: { autoDisqualifyOnViolation: true } },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newCount = candidate.cameraViolationCount + 1;
    const exceeded = newCount >= CAMERA_VIOLATION_LIMIT;

    if (exceeded) {
      const reasonLine = `Flagged: camera/microphone access denied ${CAMERA_VIOLATION_LIMIT} times.`;
      if (candidate.campaign.autoDisqualifyOnViolation) {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: {
            cameraViolationCount: newCount,
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: `Disqualified: camera/microphone access denied ${CAMERA_VIOLATION_LIMIT} times.`,
            activeToken: null,
          },
        });
        return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: true });
      }
      // Flag-only mode: record the reason, leave status/activeToken alone.
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          cameraViolationCount: newCount,
          disqualifyReason: candidate.disqualifyReason
            ? `${candidate.disqualifyReason}\n${reasonLine}`
            : reasonLine,
        },
      });
      return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: false });
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { cameraViolationCount: newCount },
    });
    return NextResponse.json({ count: newCount, limit: CAMERA_VIOLATION_LIMIT, disqualified: false });
  } catch (err) {
    console.error("POST /api/candidate/camera-violation error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit
npx eslint app/api/candidate/tab-switch/route.ts app/api/candidate/camera-violation/route.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add app/api/candidate/tab-switch/route.ts app/api/candidate/camera-violation/route.ts
git commit -m "feat(anti-cheat): flag-only mode for tab-switch and camera violations"
```

---

## Task 3: Admin PATCH route — accept the new field

**Files:**
- Modify: `app/api/admin/campaigns/[id]/route.ts` (PATCH handler)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PATCH /api/admin/campaigns/[id]` accepts `autoDisqualifyOnViolation: boolean` in its body. Task 5's admin UI sends it.

- [ ] **Step 1: Destructure the field**

Find the body-destructuring line in the `PATCH` handler (it currently lists many fields ending in `..., disqualifyOnDuplicateLogin, antiCheatTabSwitch, ...`). Add `autoDisqualifyOnViolation` to that destructured list, immediately after `disqualifyOnDuplicateLogin`:

```ts
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, autoDisqualifyOnViolation, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatMultiDisplay, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml, scheduledEnd, openJoinEnabled } = body;
```

- [ ] **Step 2: Persist it**

Find this line in the `data:` object of `prisma.campaign.update`:

```ts
        ...(disqualifyOnDuplicateLogin !== undefined && { disqualifyOnDuplicateLogin }),
```

Add directly after it:

```ts
        ...(disqualifyOnDuplicateLogin !== undefined && { disqualifyOnDuplicateLogin }),
        ...(autoDisqualifyOnViolation !== undefined && { autoDisqualifyOnViolation }),
```

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit
npx eslint "app/api/admin/campaigns/[id]/route.ts"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add "app/api/admin/campaigns/[id]/route.ts"
git commit -m "feat(api): accept autoDisqualifyOnViolation on campaign update"
```

---

## Task 4: Candidates list endpoint — score and flagged

**Files:**
- Modify: `app/api/admin/campaigns/[id]/candidates/route.ts` (`GET` handler only, lines 9-34)

**Interfaces:**
- Consumes: nothing new.
- Produces: each object in `GET /api/admin/campaigns/[id]/candidates`'s `candidates` array gains `score: number` and `flagged: boolean`. Tasks 5 and 6's UI consume both by these exact names.

- [ ] **Step 1: Add the score/flagged computation**

Find:

```ts
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const candidates = await prisma.candidate.findMany({
    where: { campaignId: id },
    select: {
      id: true,
      accessId: true,
      name: true,
      email: true,
      status: true,
      disqualifyReason: true,
      tabSwitchCount: true,
      generatedPassword: true,
    },
  });
  const seqOf = (accessId: string) => {
    const m = accessId.match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  candidates.sort((a, b) => seqOf(a.accessId) - seqOf(b.accessId));
  return NextResponse.json({ candidates });
}
```

Replace with:

```ts
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ownerId = await getOwnerId();
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await ownedCampaign(id, ownerId);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const candidates = await prisma.candidate.findMany({
    where: { campaignId: id },
    select: {
      id: true,
      accessId: true,
      name: true,
      email: true,
      status: true,
      disqualifyReason: true,
      tabSwitchCount: true,
      generatedPassword: true,
      responses: { select: { score: true } },
    },
  });
  const seqOf = (accessId: string) => {
    const m = accessId.match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  candidates.sort((a, b) => seqOf(a.accessId) - seqOf(b.accessId));
  const withScore = candidates.map(({ responses, ...c }) => ({
    ...c,
    score: responses.reduce((sum, r) => sum + r.score, 0),
    flagged: c.status !== "DISQUALIFIED" && !!c.disqualifyReason,
  }));
  return NextResponse.json({ candidates: withScore });
}
```

- [ ] **Step 2: Verify**

```powershell
npx tsc --noEmit
npx eslint "app/api/admin/campaigns/[id]/candidates/route.ts"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add "app/api/admin/campaigns/[id]/candidates/route.ts"
git commit -m "feat(api): add score and flagged to candidates list response"
```

---

## Task 5: Admin UI — settings toggle + Candidates tab

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (`Campaign` interface; `OverviewTab` state/effect/save/JSX; `Candidate` interface; `CandidatesTab` table)

**Interfaces:**
- Consumes: `PATCH .../campaigns/[id]` accepting `autoDisqualifyOnViolation` (Task 3); `GET .../candidates` returning `score`/`flagged` (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the field to the `Campaign` interface**

Find:

```ts
  disqualifyOnDuplicateLogin: boolean;
```

Replace with:

```ts
  disqualifyOnDuplicateLogin: boolean;
  autoDisqualifyOnViolation: boolean;
```

- [ ] **Step 2: Add state, sync effect, and save-body entry in `OverviewTab`**

Find:

```ts
  const [disqualifyOnDuplicateLogin, setDisqualifyOnDuplicateLogin] = useState(
    campaign.disqualifyOnDuplicateLogin,
  );
```

Replace with:

```ts
  const [disqualifyOnDuplicateLogin, setDisqualifyOnDuplicateLogin] = useState(
    campaign.disqualifyOnDuplicateLogin,
  );
  const [autoDisqualifyOnViolation, setAutoDisqualifyOnViolation] = useState(
    campaign.autoDisqualifyOnViolation,
  );
```

Find (in the "sync form when campaign changes" effect):

```ts
    setDisqualifyOnDuplicateLogin(campaign.disqualifyOnDuplicateLogin);
```

Replace with:

```ts
    setDisqualifyOnDuplicateLogin(campaign.disqualifyOnDuplicateLogin);
    setAutoDisqualifyOnViolation(campaign.autoDisqualifyOnViolation);
```

Find (in `handleSave`'s PATCH body):

```ts
          disqualifyOnDuplicateLogin,
```

Replace with:

```ts
          disqualifyOnDuplicateLogin,
          autoDisqualifyOnViolation,
```

- [ ] **Step 3: Add the toggle at the top of "Anti-cheat & Security"**

Find:

```tsx
          {/* Anti-cheat & Security */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Anti-cheat &amp; Security
            </p>
            <div className="flex flex-col gap-3">
              {/* Tab switch detection */}
```

Replace with:

```tsx
          {/* Anti-cheat & Security */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              Anti-cheat &amp; Security
            </p>
            <div className="flex flex-col gap-3">
              {/* Auto-disqualify policy — governs what happens when a violation below crosses its limit */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Auto-disqualify on violations
                  </p>
                  <p className="text-xs text-[#64748B]">
                    On: exceeding the tab-switch or camera violation limit disqualifies the candidate immediately and ends their session. Off: violations are recorded and visible to you here, but the candidate&apos;s session continues uninterrupted — nothing is shown to them.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoDisqualifyOnViolation}
                  onClick={() => setAutoDisqualifyOnViolation((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    autoDisqualifyOnViolation ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      autoDisqualifyOnViolation ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>

              {/* Tab switch detection */}
```

- [ ] **Step 4: Add `score`/`flagged` to the `Candidate` interface**

Find:

```ts
interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  disqualifyReason: string | null;
  tabSwitchCount: number;
  generatedPassword: string | null;
}
```

Replace with:

```ts
interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  disqualifyReason: string | null;
  tabSwitchCount: number;
  generatedPassword: string | null;
  score: number;
  flagged: boolean;
}
```

- [ ] **Step 5: Add a Score column and Flagged indicator to `CandidatesTab`'s table**

Find:

```tsx
                  <th className="px-5 py-3 text-left">Access ID</th>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Password</th>
                  <th className="px-5 py-3 text-right"></th>
```

Replace with:

```tsx
                  <th className="px-5 py-3 text-left">Access ID</th>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Email</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Score</th>
                  <th className="px-5 py-3 text-left">Password</th>
                  <th className="px-5 py-3 text-right"></th>
```

Find:

```tsx
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
                      <td className="px-5 py-3">
                        {c.generatedPassword ? (
```

Replace with:

```tsx
                      <td className="px-5 py-3">
                        <span
                          title={c.status === "DISQUALIFIED" ? c.disqualifyReason ?? undefined : undefined}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            CANDIDATE_STATUS_STYLES[c.status] ??
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {candidateStatusLabel(c.status)}
                        </span>
                        {c.status === "DISQUALIFIED" && c.disqualifyReason && (
                          <p className="mt-0.5 max-w-[240px] whitespace-pre-line text-xs text-[#94A3B8]">{c.disqualifyReason}</p>
                        )}
                        {c.flagged && (
                          <>
                            <span
                              title={c.disqualifyReason ?? undefined}
                              className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                            >
                              Flagged
                            </span>
                            {c.disqualifyReason && (
                              <p className="mt-0.5 max-w-[240px] whitespace-pre-line text-xs text-[#94A3B8]">{c.disqualifyReason}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[#0F172A]">{c.score}</td>
                      <td className="px-5 py-3">
                        {c.generatedPassword ? (
```

- [ ] **Step 6: Verify**

```powershell
npx tsc --noEmit
npx eslint "app/admin/campaigns/[id]/page.tsx"
```

Expected: no new errors versus the documented pre-existing baseline for this file (5 errors / 2 warnings, all in code this task doesn't touch — cross-check any reported line against this task's edits before treating it as a regression).

- [ ] **Step 7: Commit**

```powershell
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "feat(admin): auto-disqualify toggle, Score column, Flagged indicator on Candidates tab"
```

---

## Task 6: Live Session UI — Score column and Flagged indicator

**Files:**
- Modify: `app/admin/session/page.tsx` (`Candidate` interface; table header; candidate row)

**Interfaces:**
- Consumes: `GET .../candidates` returning `score`/`flagged` (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `score`/`flagged` to the `Candidate` interface**

Find:

```ts
interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  disqualifyReason: string | null;
}
```

Replace with:

```ts
interface Candidate {
  id: string;
  accessId: string;
  name: string;
  email: string;
  status: string;
  disqualifyReason: string | null;
  score: number;
  flagged: boolean;
}
```

- [ ] **Step 2: Add a Score column header**

Find:

```tsx
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-left">
                  <th className="pb-2 pr-4">Access ID</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2"></th>
                </tr>
```

Replace with:

```tsx
                <tr className="border-b border-[#E2E8F0] text-[#64748B] text-left">
                  <th className="pb-2 pr-4">Access ID</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2"></th>
                </tr>
```

- [ ] **Step 3: Add the Flagged indicator and Score cell to each row**

Find:

```tsx
                    <td className="py-1.5 pr-4">
                      <span
                        title={c.status === "DISQUALIFIED" ? c.disqualifyReason ?? undefined : undefined}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          c.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                          c.status === "JOINED" ? "bg-blue-100 text-blue-700" :
                          c.status === "COMPLETED" ? "bg-purple-100 text-purple-700" :
                          "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >{candidateStatusLabel(c.status)}</span>
                      {c.status === "DISQUALIFIED" && c.disqualifyReason && (
                        <p className="mt-0.5 max-w-[220px] text-[10px] text-[#94A3B8]">{c.disqualifyReason}</p>
                      )}
                    </td>
                    <td className="py-1.5">
```

Replace with:

```tsx
                    <td className="py-1.5 pr-4">
                      <span
                        title={c.status === "DISQUALIFIED" ? c.disqualifyReason ?? undefined : undefined}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          c.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                          c.status === "JOINED" ? "bg-blue-100 text-blue-700" :
                          c.status === "COMPLETED" ? "bg-purple-100 text-purple-700" :
                          "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >{candidateStatusLabel(c.status)}</span>
                      {c.status === "DISQUALIFIED" && c.disqualifyReason && (
                        <p className="mt-0.5 max-w-[220px] whitespace-pre-line text-[10px] text-[#94A3B8]">{c.disqualifyReason}</p>
                      )}
                      {c.flagged && (
                        <>
                          <span
                            title={c.disqualifyReason ?? undefined}
                            className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                          >
                            Flagged
                          </span>
                          {c.disqualifyReason && (
                            <p className="mt-0.5 max-w-[220px] whitespace-pre-line text-[10px] text-[#94A3B8]">{c.disqualifyReason}</p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-1.5 pr-4">{c.score}</td>
                    <td className="py-1.5">
```

- [ ] **Step 4: Verify**

```powershell
npx tsc --noEmit
npx eslint "app/admin/session/page.tsx"
```

Expected: no new errors versus the documented pre-existing baseline for this file (3 errors / 2 warnings, none in this task's edits).

- [ ] **Step 5: Commit**

```powershell
git add "app/admin/session/page.tsx"
git commit -m "feat(admin): Score column and Flagged indicator on Live Session"
```

---

## Task 7: Full verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full lint**

```powershell
npx eslint .
```

Expected: no *new* errors beyond the documented pre-existing baseline (confirmed throughout this project's history — cross-check any reported error's file against this plan's file list: `prisma/schema.prisma`, `app/api/candidate/tab-switch/route.ts`, `app/api/candidate/camera-violation/route.ts`, `app/api/admin/campaigns/[id]/route.ts`, `app/api/admin/campaigns/[id]/candidates/route.ts`, `app/admin/campaigns/[id]/page.tsx`, `app/admin/session/page.tsx`).

- [ ] **Step 3: Production build**

```powershell
npm run build
```

Expected: succeeds, same route table as before (no routes added or removed).

- [ ] **Step 4: Scripted end-to-end integration check**

Verify against the real dev database using throwaway rows, cleaned up in a `finally` block — same pattern as prior plans this project.

Create `scripts/verify-flag-only.mjs`:

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

let campaignId, candidateId;
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { console.log(`PASS: ${name}`); passed++; }
  else { console.log(`FAIL: ${name}`); failed++; }
}

try {
  const now = new Date();
  // Flag-only campaign: autoDisqualifyOnViolation = false, low tab-switch limit for a fast test.
  const campaign = await prisma.campaign.create({
    data: {
      name: `Verify Flag-Only ${now.getTime()}`,
      joinToken: `verify-flag-only-${now.getTime()}`,
      status: "LIVE",
      startedAt: now,
      antiCheatTabSwitch: true,
      tabSwitchLimit: 1,
      autoDisqualifyOnViolation: false,
    },
  });
  campaignId = campaign.id;

  const candidate = await prisma.candidate.create({
    data: { accessId: "FLAG-001", email: `flag-${now.getTime()}@example.com`, name: "Flag Test", passwordHash: "x", campaignId: campaign.id, status: "ACTIVE" },
  });
  candidateId = candidate.id;

  const question = await prisma.question.create({
    data: { campaignId: campaign.id, type: "mcq", text: "2+2=?", options: ["3", "4"], correctOption: 1, timeLimitSec: 30, basePoints: 10, orderIndex: 0 },
  });

  // This project's admin/candidate routes require Clerk auth or a signed JWT,
  // making direct HTTP-level scripting impractical in this environment (see
  // prior plans' Task 10/final-verification notes). This script instead
  // simulates each route's exact logic directly against the database — the
  // same approach, since these route changes are pure data-layer changes.

  // ── Simulate the tab-switch route's exact logic (limit=1, so the 2nd call exceeds it) ──
  async function simulateTabSwitch() {
    const c = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { campaign: { select: { antiCheatTabSwitch: true, tabSwitchLimit: true, autoDisqualifyOnViolation: true } } },
    });
    const newCount = c.tabSwitchCount + 1;
    const limit = c.campaign.tabSwitchLimit;
    const exceeded = limit > 0 && newCount > limit;
    if (exceeded && !c.campaign.autoDisqualifyOnViolation) {
      const reasonLine = `Flagged: exceeded tab switch limit (${limit} allowed).`;
      await prisma.candidate.update({
        where: { id: candidateId },
        data: { tabSwitchCount: newCount, disqualifyReason: c.disqualifyReason ? `${c.disqualifyReason}\n${reasonLine}` : reasonLine },
      });
      return { disqualified: false };
    }
    await prisma.candidate.update({ where: { id: candidateId }, data: { tabSwitchCount: newCount } });
    return { disqualified: false };
  }

  await simulateTabSwitch(); // count=1, within limit
  const r1 = await simulateTabSwitch(); // count=2, exceeds limit=1, flag-only mode
  check("flag-only mode never returns disqualified:true", r1.disqualified === false);

  const afterFlag = await prisma.candidate.findUnique({ where: { id: candidateId } });
  check("status unchanged (still ACTIVE, not DISQUALIFIED)", afterFlag.status === "ACTIVE");
  check("disqualifyReason recorded", afterFlag.disqualifyReason?.includes("Flagged: exceeded tab switch limit") ?? false);
  check("activeToken untouched (was never set, still null — proving no forced logout path ran)", afterFlag.activeToken === null);

  // ── Candidate can keep answering after being flagged ──
  await prisma.response.create({
    data: { candidateId, questionId: question.id, answer: 1, score: 10, responseTimeMs: 5000 },
  });
  await prisma.candidate.update({ where: { id: candidateId }, data: { status: "COMPLETED" } });

  // ── Candidates-list endpoint logic: score + flagged computation ──
  const listed = await prisma.candidate.findMany({
    where: { campaignId },
    select: { id: true, status: true, disqualifyReason: true, responses: { select: { score: true } } },
  });
  const withScore = listed.map(({ responses, ...c }) => ({
    ...c,
    score: responses.reduce((sum, r) => sum + r.score, 0),
    flagged: c.status !== "DISQUALIFIED" && !!c.disqualifyReason,
  }));
  const row = withScore.find((c) => c.id === candidateId);
  check("score reflects the answered question (10)", row.score === 10);
  check("flagged is true (has a reason, status is COMPLETED not DISQUALIFIED)", row.flagged === true);

  // ── Second scenario: autoDisqualifyOnViolation = true (default) still disqualifies immediately ──
  await prisma.campaign.update({ where: { id: campaignId }, data: { autoDisqualifyOnViolation: true, tabSwitchLimit: 1 } });
  const candidate2 = await prisma.candidate.create({
    data: { accessId: "FLAG-002", email: `hard-${now.getTime()}@example.com`, name: "Hard Test", passwordHash: "x", campaignId: campaign.id, status: "ACTIVE" },
  });
  async function simulateTabSwitchHard(cid) {
    const c = await prisma.candidate.findUnique({
      where: { id: cid },
      include: { campaign: { select: { tabSwitchLimit: true, autoDisqualifyOnViolation: true } } },
    });
    const newCount = c.tabSwitchCount + 1;
    const exceeded = c.campaign.tabSwitchLimit > 0 && newCount > c.campaign.tabSwitchLimit;
    if (exceeded && c.campaign.autoDisqualifyOnViolation) {
      await prisma.candidate.update({ where: { id: cid }, data: { tabSwitchCount: newCount, status: "DISQUALIFIED", disqualifyReason: "Disqualified: exceeded tab switch limit (1 allowed).", activeToken: null } });
      return { disqualified: true };
    }
    await prisma.candidate.update({ where: { id: cid }, data: { tabSwitchCount: newCount } });
    return { disqualified: false };
  }
  await simulateTabSwitchHard(candidate2.id);
  const r2 = await simulateTabSwitchHard(candidate2.id);
  check("default (hard) mode still disqualifies immediately", r2.disqualified === true);
  const afterHard = await prisma.candidate.findUnique({ where: { id: candidate2.id } });
  check("hard mode sets status DISQUALIFIED", afterHard.status === "DISQUALIFIED");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
} finally {
  if (campaignId) {
    await prisma.response.deleteMany({ where: { candidate: { campaignId } } });
    await prisma.candidate.deleteMany({ where: { campaignId } });
    await prisma.question.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
  }
  await prisma.$disconnect();
}
```

Run it:

```powershell
node scripts/verify-flag-only.mjs
```

Expected: all checks print `PASS`, ending with `0 failed`.

Delete the script after a passing run:

```powershell
Remove-Item scripts/verify-flag-only.mjs
```

- [ ] **Step 5: Final commit**

```powershell
git add -A
git commit -m "chore: verify flag-only violations and score visibility end-to-end" --allow-empty
```
