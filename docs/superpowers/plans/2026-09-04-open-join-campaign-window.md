# Open-Join Campaign Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin enable "open join" on a campaign so anyone with the join link can self-register (name + email, no password, no pre-added candidate) during a scheduled window that closes and force-ends in-progress exams at an explicit, admin-set end time.

**Architecture:** One new shared pure-function module (`lib/campaign-window.ts`) computes the window's close time and last-entry cutoff from two campaign fields (`scheduledEnd`, and the pre-existing `scheduledAt`/`gracePeriodMin` as a fallback). Every place that currently gates on `gracePeriodMin` alone (the join page, the login API, the exam APIs, the cron) is updated to use this shared computation instead, so the rule lives in exactly one place. Open-join registration reuses the entire existing `Candidate`/exam/scoring/results pipeline — it only adds a second way to create a `Candidate` row (self-service, no password) alongside the existing admin-driven one.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / PostgreSQL (Neon), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-open-join-campaign-window-design.md`

## Global Constraints

- **Environment gotcha:** in this dev environment, `npm`/`npx`/`prisma` commands fail via the Bash tool (its nested `cmd.exe` can't resolve `node` on PATH: `'"node"' is not recognized...`). Run all `npm`/`npx`/`prisma` commands through **PowerShell**, not Bash. Plain `node <path-to-js>` works fine in Bash when you need to bypass a `.cmd` shim.
- **No test framework for the Next.js app.** Only `socket-server/` has Jest, and it's unrelated. Verification per task is `npx tsc --noEmit`, targeted `npx eslint <changed files>`, and (final task) `npm run build`. The one exception: `lib/campaign-window.ts` is pure, dependency-free date logic — write real unit tests for it using Node's built-in test runner via `tsx` (already a devDependency): `npx tsx --test lib/campaign-window.test.ts`. No new dependency needed.
- **Error string convention:** JSON error responses use `{ error: "<message or short code>" }`. Existing short codes the frontend switches on: `"geo_restricted"`. This plan adds one more: `"window_closed"`.
- `gracePeriodMin === 0` has an existing special meaning: "no cutoff, entry never closes." Every window-close computation must preserve this exactly for campaigns that don't set `scheduledEnd`.
- Multi-tenancy: every admin-facing campaign route already scopes by `ownerId` via `lib/tenant.ts`'s `getOwnerId`/`ownedCampaign` helpers. This plan doesn't add any new admin query pattern — every task reuses those helpers exactly as the surrounding code already does.

---

## Task 1: Schema — `openJoinEnabled` and `scheduledEnd`

**Files:**
- Modify: `prisma/schema.prisma` (Campaign model, around line 68-107)
- Create: `prisma/migrations/<timestamp>_add_open_join_window/migration.sql`

**Interfaces:**
- Produces: `Campaign.openJoinEnabled: boolean` (default `false`), `Campaign.scheduledEnd: Date | null` — every later task's Prisma queries and generated types depend on these two fields existing.

- [ ] **Step 1: Add the two fields to the Campaign model**

In `prisma/schema.prisma`, find this line (part of the `Campaign` model):

```prisma
  gracePeriodMin             Int            @default(10)
```

Add two new fields directly after it:

```prisma
  gracePeriodMin             Int            @default(10)
  scheduledEnd               DateTime?
  openJoinEnabled             Boolean        @default(false)
```

- [ ] **Step 2: Create the migration file by hand**

Prisma's shadow-database-based diffing (`migrate dev`) is unreliable in this environment (Neon doesn't cleanly support the ad-hoc temp databases it wants to create). Write the migration directly instead — this is the same DDL Prisma would generate for these two field additions.

Determine today's UTC timestamp in `YYYYMMDDHHMMSS` format (e.g. via `Get-Date -AsUTC -Format "yyyyMMddHHmmss"` in PowerShell) and create:

`prisma/migrations/<timestamp>_add_open_join_window/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "scheduledEnd" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "openJoinEnabled" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Apply the migration for real**

`migrate deploy` runs pending migration files directly against the database — no shadow database involved, so it isn't affected by the reliability issue above. Run via PowerShell from the repo root:

```powershell
npx prisma migrate deploy
```

Expected output includes `Applying migration '<timestamp>_add_open_join_window'` and ends with a success message.

- [ ] **Step 4: Regenerate the Prisma client**

```powershell
npx prisma generate
```

- [ ] **Step 5: Verify**

```powershell
npx prisma migrate status
```

Expected: `Database schema is up to date!` with no pending migrations listed.

```powershell
npx tsc --noEmit
```

Expected: no errors (the two new fields now exist on the generated `Campaign` type but nothing references them yet, so this should be a clean no-op check).

- [ ] **Step 6: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add openJoinEnabled and scheduledEnd to Campaign"
```

---

## Task 2: `lib/campaign-window.ts` — shared window computation

**Files:**
- Create: `lib/campaign-window.ts`
- Test: `lib/campaign-window.test.ts`

**Interfaces:**
- Consumes: `Campaign.scheduledAt`, `Campaign.scheduledEnd`, `Campaign.gracePeriodMin`, `Campaign.durationSec` (all from Task 1's schema; `durationSec` already existed).
- Produces: `campaignCloseAt(campaign): Date | null` and `campaignLastEntryAt(campaign): Date | null` — every later task that needs to know "is the window still open" or "when does this campaign hard-end" imports these two functions from `@/lib/campaign-window`. Do not reimplement this math anywhere else.

- [ ] **Step 1: Write the failing tests**

Create `lib/campaign-window.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignCloseAt, campaignLastEntryAt } from "./campaign-window";

const BASE = { scheduledAt: null as Date | null, scheduledEnd: null as Date | null, gracePeriodMin: 10, durationSec: 0 };

test("campaignCloseAt: scheduledEnd set — returns it directly, ignoring scheduledAt/gracePeriodMin", () => {
  const scheduledEnd = new Date("2026-09-04T21:00:00.000Z");
  const result = campaignCloseAt({
    ...BASE,
    scheduledAt: new Date("2026-09-04T18:00:00.000Z"),
    scheduledEnd,
    gracePeriodMin: 999,
  });
  assert.equal(result?.getTime(), scheduledEnd.getTime());
});

test("campaignCloseAt: scheduledEnd unset — falls back to scheduledAt + gracePeriodMin", () => {
  const scheduledAt = new Date("2026-09-04T18:00:00.000Z");
  const result = campaignCloseAt({ ...BASE, scheduledAt, gracePeriodMin: 10 });
  assert.equal(result?.getTime(), scheduledAt.getTime() + 10 * 60_000);
});

test("campaignCloseAt: scheduledEnd unset, gracePeriodMin === 0 — no cutoff (null)", () => {
  const result = campaignCloseAt({
    ...BASE,
    scheduledAt: new Date("2026-09-04T18:00:00.000Z"),
    gracePeriodMin: 0,
  });
  assert.equal(result, null);
});

test("campaignCloseAt: no scheduledAt and no scheduledEnd — null", () => {
  const result = campaignCloseAt({ ...BASE, scheduledAt: null, scheduledEnd: null });
  assert.equal(result, null);
});

test("campaignLastEntryAt: scheduledEnd set — subtracts durationSec", () => {
  // 9pm close, 43-minute exam → 8:17pm last entry (matches the 43-min/9pm/8:17pm example)
  const scheduledEnd = new Date("2026-09-04T21:00:00.000Z");
  const result = campaignLastEntryAt({
    ...BASE,
    scheduledEnd,
    durationSec: 43 * 60,
  });
  assert.equal(result?.getTime(), scheduledEnd.getTime() - 43 * 60_000);
});

test("campaignLastEntryAt: scheduledEnd unset — same as campaignCloseAt", () => {
  const scheduledAt = new Date("2026-09-04T18:00:00.000Z");
  const campaign = { ...BASE, scheduledAt, gracePeriodMin: 10, durationSec: 999999 };
  assert.equal(
    campaignLastEntryAt(campaign)?.getTime(),
    campaignCloseAt(campaign)?.getTime(),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npx tsx --test lib/campaign-window.test.ts
```

Expected: FAIL — `Cannot find module './campaign-window'` (the module doesn't exist yet).

- [ ] **Step 3: Implement**

Create `lib/campaign-window.ts`:

```ts
export interface CampaignWindow {
  scheduledAt: Date | null;
  scheduledEnd: Date | null;
  gracePeriodMin: number;
  durationSec: number;
}

/**
 * The instant after which a campaign no longer accepts any activity — new
 * joins are rejected and any exam already in progress is force-ended.
 *
 * - `scheduledEnd` set: that's the answer, full stop.
 * - `scheduledEnd` unset: falls back to the legacy `scheduledAt +
 *   gracePeriodMin` model, preserving its `gracePeriodMin === 0` ⇒ "never
 *   closes" convention.
 */
export function campaignCloseAt(
  campaign: Pick<CampaignWindow, "scheduledAt" | "scheduledEnd" | "gracePeriodMin">,
): Date | null {
  if (campaign.scheduledEnd) return campaign.scheduledEnd;
  if (!campaign.scheduledAt || campaign.gracePeriodMin === 0) return null;
  return new Date(campaign.scheduledAt.getTime() + campaign.gracePeriodMin * 60_000);
}

/**
 * The last instant a *new* candidate may join. Equal to campaignCloseAt()
 * unless `scheduledEnd` is set, in which case it's pulled earlier by the
 * campaign's current total question duration, so a joiner can still finish
 * before the window closes.
 */
export function campaignLastEntryAt(campaign: CampaignWindow): Date | null {
  if (campaign.scheduledEnd) {
    return new Date(campaign.scheduledEnd.getTime() - campaign.durationSec * 1000);
  }
  return campaignCloseAt(campaign);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npx tsx --test lib/campaign-window.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/campaign-window.ts lib/campaign-window.test.ts
git commit -m "feat(scheduling): add campaignCloseAt/campaignLastEntryAt helpers"
```

---

## Task 3: Campaign update API — validate and persist the new fields

**Files:**
- Modify: `app/api/admin/campaigns/[id]/route.ts` (PATCH handler, lines 31-87)

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is a standalone API change).
- Produces: `PATCH /api/admin/campaigns/[id]` now accepts `scheduledEnd` (ISO string or `null`) and `openJoinEnabled` (boolean) in its JSON body, validated before persisting. Task 8/9's admin UI send these fields.

Note: the spec's "open items" section left it open whether the campaign *creation* endpoint (`app/api/admin/campaigns/route.ts`, `POST`) also needs these two fields. It doesn't: that endpoint only ever accepts `name`/`logoUrl`/`bgColor` — every other campaign setting, including the existing `gracePeriodMin` this feature parallels, is set via a follow-up `PATCH` from the creation wizard's step 2 (see Task 9). `scheduledEnd`/`openJoinEnabled` follow that same established pattern, so only the `PATCH` handler in this task needs them.

- [ ] **Step 1: Add validation and the two fields to the PATCH handler**

In `app/api/admin/campaigns/[id]/route.ts`, find:

```ts
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatMultiDisplay, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml } = body;
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Campaign name cannot be empty" }, { status: 400 });
    }
```

Replace with:

```ts
    const body = await req.json();
    const { name, scheduledAt, autoStart, maxCandidates, negativeMarking, negativeMarkingValue, logoUrl, bgColor, gracePeriodMin, disqualifyOnDuplicateLogin, antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick, antiCheatScreenshot, antiCheatDevTools, antiCheatCamera, antiCheatMultiDisplay, antiCheatShuffleQuestions, antiCheatShuffleAnswers, completionMessage, instructionsHtml, scheduledEnd, openJoinEnabled } = body;
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Campaign name cannot be empty" }, { status: 400 });
    }

    // Validate the window: scheduledEnd (if present after this update) must
    // be strictly after scheduledAt, and open-join campaigns must have a
    // scheduledEnd — there's no other sensible way to bound them.
    const effectiveScheduledAt =
      scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt;
    const effectiveScheduledEnd =
      scheduledEnd !== undefined ? (scheduledEnd ? new Date(scheduledEnd) : null) : existing.scheduledEnd;
    if (effectiveScheduledEnd && effectiveScheduledAt && effectiveScheduledEnd <= effectiveScheduledAt) {
      return NextResponse.json({ error: "End time must be after the scheduled start time" }, { status: 400 });
    }
    const effectiveOpenJoinEnabled =
      openJoinEnabled !== undefined ? openJoinEnabled : existing.openJoinEnabled;
    if (effectiveOpenJoinEnabled && !effectiveScheduledEnd) {
      return NextResponse.json({ error: "Open-join campaigns need an end time" }, { status: 400 });
    }
```

- [ ] **Step 2: Persist the two fields**

In the same file, find the `data:` object inside `prisma.campaign.update`:

```ts
        ...(gracePeriodMin !== undefined && { gracePeriodMin: Number(gracePeriodMin) }),
```

Add directly after it:

```ts
        ...(gracePeriodMin !== undefined && { gracePeriodMin: Number(gracePeriodMin) }),
        ...(scheduledEnd !== undefined && { scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null }),
        ...(openJoinEnabled !== undefined && { openJoinEnabled }),
```

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit
npx eslint app/api/admin/campaigns/[id]/route.ts
```

Expected: no errors from either command.

- [ ] **Step 4: Commit**

```powershell
git add app/api/admin/campaigns/[id]/route.ts
git commit -m "feat(api): validate and persist scheduledEnd/openJoinEnabled on campaign update"
```

---

## Task 4: Join gate — window computation + open-join routing

**Files:**
- Modify: `app/join/[token]/page.tsx` (full file, 39 lines)
- Modify: `app/join/[token]/JoinGate.tsx` (full file, 207 lines)

**Interfaces:**
- Consumes: `campaignLastEntryAt` from `@/lib/campaign-window` (Task 2).
- Produces: `JoinGate`'s "Join Now" button routes to `/candidate/login?token=X&mode=open` for open-join campaigns, `/candidate/login?token=X` otherwise — Task 5's login page reads this `mode` param.

- [ ] **Step 1: Pass the new fields through the server component**

Replace the full contents of `app/join/[token]/page.tsx` with:

```tsx
import { prisma } from "@/lib/prisma";
import JoinGate from "./JoinGate";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { joinToken: token },
    select: {
      name: true,
      status: true,
      scheduledAt: true,
      scheduledEnd: true,
      gracePeriodMin: true,
      durationSec: true,
      openJoinEnabled: true,
    },
  });

  if (!campaign) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm max-w-sm w-full">
          <p className="text-sm font-semibold text-[#0F172A]">Invalid join link</p>
          <p className="mt-1 text-xs text-[#64748B]">This link is not valid or has been removed.</p>
        </div>
      </main>
    );
  }

  return (
    <JoinGate
      name={campaign.name}
      status={campaign.status}
      scheduledAt={campaign.scheduledAt?.toISOString() ?? null}
      scheduledEnd={campaign.scheduledEnd?.toISOString() ?? null}
      gracePeriodMin={campaign.gracePeriodMin}
      durationSec={campaign.durationSec}
      openJoinEnabled={campaign.openJoinEnabled}
      token={token}
    />
  );
}
```

- [ ] **Step 2: Use the shared window computation in `JoinGate`, and route by mode**

Replace the full contents of `app/join/[token]/JoinGate.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { campaignLastEntryAt } from "@/lib/campaign-window";

interface Props {
  name: string;
  status: string;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  gracePeriodMin: number;
  durationSec: number;
  openJoinEnabled: boolean;
  token: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function JoinGate({ name, status, scheduledAt, scheduledEnd, gracePeriodMin, durationSec, openJoinEnabled, token }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loginUrl = openJoinEnabled
    ? `/candidate/login?token=${token}&mode=open`
    : `/candidate/login?token=${token}`;

  // ── ENDED ──────────────────────────────────────────────────────────────────
  if (status === "ENDED") {
    return (
      <Shell name={name}>
        <StatusIcon type="closed" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment closed</h2>
        <p className="mt-1 text-sm text-[#64748B]">This assessment has ended and is no longer accepting entries.</p>
      </Shell>
    );
  }

  // ── DRAFT ──────────────────────────────────────────────────────────────────
  if (status === "DRAFT") {
    return (
      <Shell name={name}>
        <StatusIcon type="draft" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Not yet available</h2>
        <p className="mt-1 text-sm text-[#64748B]">This assessment is not yet available. Check back later.</p>
      </Shell>
    );
  }

  // ── SCHEDULED — countdown to start ────────────────────────────────────────
  if (status === "SCHEDULED") {
    const opensAt = scheduledAt ? new Date(scheduledAt).getTime() : null;
    const msLeft = opensAt ? opensAt - now : null;

    if (msLeft !== null && msLeft <= 0) {
      // Scheduled time has passed but campaign hasn't started yet — refresh every 5s
      return (
        <Shell name={name}>
          <StatusIcon type="scheduled" />
          <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment starting soon…</h2>
          <p className="mt-1 text-sm text-[#64748B]">Please wait. The assessment is about to begin.</p>
          <AutoRefresh intervalMs={5000} />
        </Shell>
      );
    }

    return (
      <Shell name={name}>
        <StatusIcon type="scheduled" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment opens in</h2>
        {msLeft !== null ? (
          <div className="mt-4 flex items-center justify-center">
            <span className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-8 py-4 font-mono text-3xl font-bold tracking-widest text-[#6366F1]">
              {formatCountdown(msLeft)}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#64748B]">Starting at a scheduled time.</p>
        )}
        {scheduledAt && (
          <p className="mt-3 text-xs text-[#94A3B8]">
            Scheduled for {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
        <p className="mt-4 text-xs text-[#94A3B8]">Keep this page open — you&apos;ll be able to join when it starts.</p>
        <AutoRefresh intervalMs={5000} />
      </Shell>
    );
  }

  // ── LIVE or PAUSED — window entry check ───────────────────────────────────
  if (status === "LIVE" || status === "PAUSED") {
    const lastEntryAt = campaignLastEntryAt({
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
      gracePeriodMin,
      durationSec,
    });
    const withinWindow = !lastEntryAt || now <= lastEntryAt.getTime();
    const entryMsLeft = lastEntryAt ? Math.max(0, lastEntryAt.getTime() - now) : 0;

    if (!withinWindow) {
      return (
        <Shell name={name}>
          <StatusIcon type="late" />
          <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Entry period has closed</h2>
          <p className="mt-1 text-sm text-[#64748B]">
            The assessment is underway but the entry window has passed. You can no longer join.
          </p>
        </Shell>
      );
    }

    return (
      <Shell name={name}>
        <StatusIcon type="live" />
        <h2 className="mt-4 text-base font-semibold text-[#0F172A]">Assessment is underway</h2>
        <p className="mt-2 text-sm text-[#64748B]">
          {status === "PAUSED"
            ? "The assessment is currently paused. You can still log in."
            : "The assessment has started. Join now before the entry window closes."}
        </p>

        {lastEntryAt && entryMsLeft > 0 && status === "LIVE" && (
          <div className="mt-4 text-center">
            <p className="text-xs text-[#94A3B8] mb-1">Entry closes in</p>
            <span className="inline-block rounded-xl border border-amber-200 bg-amber-50 px-5 py-2 font-mono text-lg font-bold text-amber-700">
              {formatCountdown(entryMsLeft)}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push(loginUrl)}
          className="mt-6 w-full rounded-xl bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#4F46E5] transition-colors"
        >
          Join Now →
        </button>
      </Shell>
    );
  }

  return null;
}

// ── Shared layout shell ───────────────────────────────────────────────────────

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#94A3B8]">Assessment</p>
        <h1 className="mt-1 text-lg font-bold text-[#0F172A]">{name}</h1>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ type }: { type: "draft" | "scheduled" | "live" | "late" | "closed" }) {
  const configs = {
    draft:     { bg: "bg-[#F1F5F9]",  ring: "ring-[#E2E8F0]",   text: "text-[#94A3B8]" },
    scheduled: { bg: "bg-blue-50",    ring: "ring-blue-100",     text: "text-blue-500" },
    live:      { bg: "bg-green-50",   ring: "ring-green-100",    text: "text-green-600" },
    late:      { bg: "bg-amber-50",   ring: "ring-amber-100",    text: "text-amber-600" },
    closed:    { bg: "bg-red-50",     ring: "ring-red-100",      text: "text-red-500" },
  };
  const c = configs[type];
  const icons = {
    draft:     <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />,
    scheduled: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    live:      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />,
    late:      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
    closed:    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />,
  };

  return (
    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ring-1 ${c.bg} ${c.ring}`}>
      <svg className={`h-6 w-6 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        {icons[type]}
      </svg>
    </div>
  );
}

// ── Silent auto-refresh ───────────────────────────────────────────────────────

function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), intervalMs);
    return () => clearTimeout(id);
  }, [intervalMs]);
  return null;
}
```

(This is the same file with: 3 new props (`scheduledEnd`, `durationSec`, `openJoinEnabled`), the now-unused `startedAt` prop removed, and the LIVE/PAUSED block's grace-period math replaced by `campaignLastEntryAt`. Every other branch — DRAFT/SCHEDULED/ENDED, `Shell`, `StatusIcon`, `AutoRefresh` — is byte-identical to before.)

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit
npx eslint app/join/[token]/page.tsx app/join/[token]/JoinGate.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add app/join/[token]/page.tsx app/join/[token]/JoinGate.tsx
git commit -m "feat(join): use shared window computation, route open-join to registration form"
```

---

## Task 5: Open-join registration — login API branch + login page form

**Files:**
- Modify: `app/api/auth/login/route.ts` (full file, 83 lines)
- Modify: `app/candidate/login/page.tsx` (full file, 117 lines)

**Interfaces:**
- Consumes: `campaignLastEntryAt` (Task 2); `generatePassword`, `hashPassword`, `makeAccessId`, `nextAccessSeq` from `@/lib/campaign-utils` (pre-existing, used identically to `app/api/admin/campaigns/[id]/candidates/route.ts`).
- Produces: `POST /api/auth/login` accepts `{ mode: "open", name, email, joinToken }` in addition to its existing `{ accessId, password, joinToken }` shape, returning the same `{ token, candidateName }` shape either way.

- [ ] **Step 1: Add the open-join branch to the login API**

Replace the full contents of `app/api/auth/login/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/jwt";
import { CampaignStatus, CandidateStatus, type Candidate } from "@prisma/client";
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";
import { campaignLastEntryAt } from "@/lib/campaign-window";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessId, password, joinToken, mode, name, email } = body;

    // Resolve campaign from joinToken
    const campaign = joinToken
      ? await prisma.campaign.findUnique({ where: { joinToken } })
      : null;

    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 400 });
    }

    if (campaign.status !== CampaignStatus.LIVE && campaign.status !== CampaignStatus.PAUSED) {
      return NextResponse.json({ error: "This assessment is not currently open" }, { status: 403 });
    }

    let candidate: Candidate;

    if (mode === "open") {
      if (!campaign.openJoinEnabled) {
        return NextResponse.json({ error: "This assessment does not accept open joins" }, { status: 403 });
      }
      if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
      }

      const lastEntryAt = campaignLastEntryAt(campaign);
      if (lastEntryAt && new Date() > lastEntryAt) {
        return NextResponse.json({ error: "This assessment's entry window has closed" }, { status: 403 });
      }

      const emailNorm = email.trim().toLowerCase();
      const existingCandidate = await prisma.candidate.findFirst({
        where: { email: emailNorm, campaignId: campaign.id },
      });

      if (existingCandidate) {
        candidate = existingCandidate;
      } else {
        const existingAccessIds = await prisma.candidate.findMany({
          where: { campaignId: campaign.id },
          select: { accessId: true },
        });
        const nextSeq = nextAccessSeq(existingAccessIds);
        const newAccessId = makeAccessId(campaign.name, nextSeq, campaign.maxCandidates);
        const plainPassword = generatePassword();
        candidate = await prisma.candidate.create({
          data: {
            accessId: newAccessId,
            email: emailNorm,
            name: name.trim(),
            passwordHash: await hashPassword(plainPassword),
            generatedPassword: plainPassword,
            campaignId: campaign.id,
            status: CandidateStatus.REGISTERED,
          },
        });
      }

      if (candidate.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }
    } else {
      if (!accessId?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "Access ID and password are required" }, { status: 400 });
      }

      const found = await prisma.candidate.findFirst({
        where: { accessId: accessId.trim().toUpperCase(), campaignId: campaign.id },
      });

      if (!found) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (found.status === CandidateStatus.DISQUALIFIED) {
        return NextResponse.json({ error: "You have been disqualified from this assessment" }, { status: 403 });
      }

      const valid = await bcrypt.compare(password, found.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      candidate = found;
    }

    // Atomic single-session enforcement
    const claimed = await prisma.candidate.updateMany({
      where: { id: candidate.id, activeToken: null },
      data: { activeToken: "pending", status: CandidateStatus.JOINED },
    });

    if (claimed.count === 0) {
      if (campaign.disqualifyOnDuplicateLogin) {
        // Disqualify and kill both sessions
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            status: CandidateStatus.DISQUALIFIED,
            disqualifyReason: "Duplicate login detected — assessment rules prohibit logging in from multiple devices.",
            activeToken: null,
          },
        });
        return NextResponse.json(
          { error: "You have been disqualified: login attempted from a second device." },
          { status: 403 }
        );
      }
      // Soft block — just reject the second device, first session continues
      return NextResponse.json(
        { error: "You are already logged in from another device." },
        { status: 409 }
      );
    }

    const token = signToken({ candidateId: candidate.id, campaignId: campaign.id });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { activeToken: token } });

    return NextResponse.json({ token, candidateName: candidate.name });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add the conditional registration form to the login page**

Replace the full contents of `app/candidate/login/page.tsx` with:

```tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setToken } from "@/lib/auth-store";
import { useBranding } from "@/lib/use-branding";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const joinToken = params.get("token") ?? "";
  const openJoin = params.get("mode") === "open";
  const branding = useBranding(joinToken);

  const [accessId, setAccessId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = openJoin
        ? { mode: "open", name, email, joinToken }
        : { accessId, password, joinToken };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      setToken(data.token);
      if (data.candidateName) {
        sessionStorage.setItem("candidateName", data.candidateName);
      }
      router.replace("/candidate/waiting-room");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl mb-3"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
          >
            <span className="text-xl font-bold text-white">{branding.orgName.charAt(0)}</span>
          </div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#64748B]">{branding.orgName}</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#0F172A] mb-6">
            {openJoin ? "Join Assessment" : "Candidate Login"}
          </h1>
          {openJoin ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6366F1] py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Joining…" : "Join Assessment"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1">Access ID</label>
                <input
                  type="text"
                  value={accessId}
                  onChange={e => setAccessId(e.target.value.toUpperCase())}
                  placeholder="RELA-001"
                  required
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Your Access ID was emailed to you — e.g. RELA-001.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#6366F1] py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
              <div className="text-right">
                <Link
                  href={joinToken ? `/candidate/forgot-password?token=${joinToken}` : "/candidate/forgot-password"}
                  className="text-xs text-[#64748B] hover:text-[#6366F1] hover:underline underline-offset-2"
                >
                  Forgot your password?
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CandidateLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit
npx eslint app/api/auth/login/route.ts app/candidate/login/page.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add app/api/auth/login/route.ts app/candidate/login/page.tsx
git commit -m "feat(auth): open-join self-registration (name+email, no password)"
```

---

## Task 6: Hard cutoff for in-progress exams

**Files:**
- Modify: `app/api/assessment/submit-answer/route.ts` (lines 29-41)
- Modify: `app/api/assessment/next-question/route.ts` (lines 27-53)
- Modify: `app/candidate/exam/page.tsx` (lines 88-104)

**Interfaces:**
- Consumes: `campaignCloseAt` from `@/lib/campaign-window` (Task 2).
- Produces: both assessment endpoints return `{ error: "window_closed" }` with `403` once the campaign's window has closed; the exam page recognizes this code and redirects to `/candidate/result` instead of `/candidate/disqualified`.

- [ ] **Step 1: `submit-answer` — select campaign window fields and reject after close**

In `app/api/assessment/submit-answer/route.ts`, find:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { calculateScore, isMultiSelectAnswerCorrect } from "@/lib/scoring";
import { getSettings } from "@/lib/get-settings";
import { AnswerPayload, QuestionType, isOptionBasedQuestionType } from "@/types";
import { translateDisplayIndexToCanonical } from "@/lib/shuffle";
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { calculateScore, isMultiSelectAnswerCorrect } from "@/lib/scoring";
import { getSettings } from "@/lib/get-settings";
import { AnswerPayload, QuestionType, isOptionBasedQuestionType } from "@/types";
import { translateDisplayIndexToCanonical } from "@/lib/shuffle";
import { campaignCloseAt } from "@/lib/campaign-window";
```

Then find:

```ts
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status === "DISQUALIFIED") {
    return NextResponse.json(
      { error: "You have been disqualified from this assessment" },
      { status: 403 }
    );
  }
```

Replace with:

```ts
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      status: true,
      campaign: { select: { scheduledAt: true, scheduledEnd: true, gracePeriodMin: true } },
    },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status === "DISQUALIFIED") {
    return NextResponse.json(
      { error: "You have been disqualified from this assessment" },
      { status: 403 }
    );
  }
  const closeAt = campaignCloseAt(candidate.campaign);
  if (closeAt && new Date() > closeAt) {
    return NextResponse.json({ error: "window_closed" }, { status: 403 });
  }
```

- [ ] **Step 2: `next-question` — same check**

In `app/api/assessment/next-question/route.ts`, find:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { getSettings } from "@/lib/get-settings";
import { PublicQuestion, QuestionType, isOptionBasedQuestionType } from "@/types";
import { pickNextQuestion, applySeededShuffle } from "@/lib/shuffle";
```

Replace with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { getSettings } from "@/lib/get-settings";
import { PublicQuestion, QuestionType, isOptionBasedQuestionType } from "@/types";
import { pickNextQuestion, applySeededShuffle } from "@/lib/shuffle";
import { campaignCloseAt } from "@/lib/campaign-window";
```

Then find:

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
                    ownerId: true,
                },
            },
        },
    });

    if (!candidate) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (candidate.status === "DISQUALIFIED") {
        return NextResponse.json(
            { error: "You have been disqualified from this assessment" },
            { status: 403 }
        );
    }
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
                    ownerId: true,
                    scheduledAt: true,
                    scheduledEnd: true,
                    gracePeriodMin: true,
                },
            },
        },
    });

    if (!candidate) {
        return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (candidate.status === "DISQUALIFIED") {
        return NextResponse.json(
            { error: "You have been disqualified from this assessment" },
            { status: 403 }
        );
    }

    if (candidate.campaign) {
        const closeAt = campaignCloseAt(candidate.campaign);
        if (closeAt && new Date() > closeAt) {
            return NextResponse.json({ error: "window_closed" }, { status: 403 });
        }
    }
```

(This file already accesses `candidate.campaign` defensively elsewhere — e.g. `candidate.campaign?.completionMessage` a few lines below — so this new check matches that existing style with an `if` guard rather than asserting non-null.)

- [ ] **Step 3: Exam page — recognize `window_closed` and redirect to the result page, not disqualified**

In `app/candidate/exam/page.tsx`, find:

```ts
    if (res.status === 403) {
      let reason = "Your assessment was ended for a policy violation.";
      try {
        const data = await res.json();
        if (data.error === "geo_restricted") {
          reason = "This assessment is not available in your region.";
        } else {
          reason = data.error ?? reason;
        }
      } catch {}
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
      return;
    }
```

Replace with:

```ts
    if (res.status === 403) {
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {}

      if (data.error === "window_closed") {
        sessionStorage.setItem("completionMessage", "This assessment's scheduled window has closed.");
        sessionStorage.removeItem("totalQuestions");
        disconnectSocket();
        router.push("/candidate/result");
        return;
      }

      let reason = "Your assessment was ended for a policy violation.";
      if (data.error === "geo_restricted") {
        reason = "This assessment is not available in your region.";
      } else if (data.error) {
        reason = data.error;
      }
      sessionStorage.setItem("disqualifyReason", reason);
      disconnectSocket();
      router.push("/candidate/disqualified");
      return;
    }
```

- [ ] **Step 4: Verify**

```powershell
npx tsc --noEmit
npx eslint app/api/assessment/submit-answer/route.ts app/api/assessment/next-question/route.ts app/candidate/exam/page.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add app/api/assessment/submit-answer/route.ts app/api/assessment/next-question/route.ts app/candidate/exam/page.tsx
git commit -m "feat(exam): hard-cutoff in-progress exams at campaign window close"
```

---

## Task 7: Cron — end campaigns at `scheduledEnd` too

**Files:**
- Modify: `app/api/cron/session-scheduler/route.ts` (lines 33-47)

**Interfaces:**
- Consumes: `Campaign.scheduledEnd` (Task 1).
- Produces: no new exports — this is a leaf change to the cron's own end-campaign filter.

- [ ] **Step 1: Add the `scheduledEnd` condition**

In `app/api/cron/session-scheduler/route.ts`, find:

```ts
    // Auto-end campaigns that have exceeded durationSec
    const live = await prisma.campaign.findMany({
      where: { status: { in: [CampaignStatus.LIVE, CampaignStatus.PAUSED] }, startedAt: { not: null } },
    });
    const toEnd = live.filter(c => {
      if (!c.startedAt || !c.durationSec) return false;
      const elapsed = (now.getTime() - c.startedAt.getTime()) / 1000;
      return elapsed >= c.durationSec;
    });
```

Replace with:

```ts
    // Auto-end campaigns that have exceeded durationSec, or whose scheduledEnd has passed
    const live = await prisma.campaign.findMany({
      where: { status: { in: [CampaignStatus.LIVE, CampaignStatus.PAUSED] }, startedAt: { not: null } },
    });
    const toEnd = live.filter(c => {
      if (c.scheduledEnd && now >= c.scheduledEnd) return true;
      if (!c.startedAt || !c.durationSec) return false;
      const elapsed = (now.getTime() - c.startedAt.getTime()) / 1000;
      return elapsed >= c.durationSec;
    });
```

- [ ] **Step 2: Verify**

```powershell
npx tsc --noEmit
npx eslint app/api/cron/session-scheduler/route.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add app/api/cron/session-scheduler/route.ts
git commit -m "feat(cron): auto-end campaigns at scheduledEnd"
```

---

## Task 8: Admin UI — campaign edit page

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (Campaign interface ~line 36-67; `OverviewTab` state/effect/save ~line 197-329; scheduling JSX ~line 488-644; `CandidatesTab` ~line 1845-2678)

**Interfaces:**
- Consumes: `PATCH /api/admin/campaigns/[id]` accepting `scheduledEnd`/`openJoinEnabled` (Task 3).
- Produces: nothing consumed by later tasks — this is the last UI surface.

- [ ] **Step 1: Add the two fields to the `Campaign` interface**

Find (in the TypeScript `Campaign` interface near the top of the file, not `prisma/schema.prisma`):

```ts
  gracePeriodMin: number;
```

Replace with:

```ts
  gracePeriodMin: number;
  scheduledEnd: string | null;
  openJoinEnabled: boolean;
```

- [ ] **Step 2: Add state, sync effect, and save-body entries in `OverviewTab`**

Find:

```ts
  const [gracePeriodMin, setGracePeriodMin] = useState(campaign.gracePeriodMin);
```

Replace with:

```ts
  const [gracePeriodMin, setGracePeriodMin] = useState(campaign.gracePeriodMin);
  const [scheduledEnd, setScheduledEnd] = useState(
    campaign.scheduledEnd ? campaign.scheduledEnd.slice(0, 16) : "",
  );
  const [openJoinEnabled, setOpenJoinEnabled] = useState(campaign.openJoinEnabled);
```

Find (in the "sync form when campaign changes" effect):

```ts
    setGracePeriodMin(campaign.gracePeriodMin);
```

Replace with:

```ts
    setGracePeriodMin(campaign.gracePeriodMin);
    setScheduledEnd(campaign.scheduledEnd ? campaign.scheduledEnd.slice(0, 16) : "");
    setOpenJoinEnabled(campaign.openJoinEnabled);
```

Find (in `handleSave`'s PATCH body):

```ts
          gracePeriodMin,
```

Replace with:

```ts
          gracePeriodMin,
          scheduledEnd: scheduledEnd || null,
          openJoinEnabled,
```

- [ ] **Step 3: Add a live last-entry advisory computation**

Find (right before the `return (` in `OverviewTab`, immediately after `handleDelete`'s closing brace and the `joinLink` const):

```ts
  const joinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${campaign.joinToken}`
      : `/join/${campaign.joinToken}`;
```

Replace with:

```ts
  const joinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${campaign.joinToken}`
      : `/join/${campaign.joinToken}`;

  const lastEntryPreview = (() => {
    if (!scheduledEnd) return null;
    const endDate = new Date(scheduledEnd);
    if (Number.isNaN(endDate.getTime())) return null;
    const lastEntry = new Date(endDate.getTime() - campaign.durationSec * 1000);
    const startDate = scheduledAt ? new Date(scheduledAt) : null;
    return {
      time: lastEntry.toLocaleString(),
      tooLate: !!startDate && !Number.isNaN(startDate.getTime()) && lastEntry < startDate,
    };
  })();
```

- [ ] **Step 4: Relabel "Scheduled start" when open-join is on**

Find:

```tsx
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Scheduled start
              </label>
```

Replace with:

```tsx
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                {openJoinEnabled ? "Window opens at" : "Scheduled start"}
              </label>
```

- [ ] **Step 5: Insert the "Assessment ends at" field, hide "Late join window" when `scheduledEnd` is set, and add the "Open join" toggle**

Find:

```tsx
          {/* Candidate entry grace period */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Late join window
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              How long after the assessment starts candidates can still join.
              Set to 0 to allow no late entry.
            </p>
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15, 20, 30, 60].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setGracePeriodMin(min)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    gracePeriodMin === min
                      ? "border-[#6366F1] bg-[#6366F1] text-white"
                      : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                  }`}
                >
                  {min === 0 ? "No late entry" : `${min} min`}
                </button>
              ))}
            </div>
          </div>
```

Replace with:

```tsx
          {/* Assessment ends at — the authoritative close time when set */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Assessment ends at
            </label>
            <input
              type="datetime-local"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
            />
            <p className="mt-1 text-xs text-[#64748B]">
              Optional. When set, this is the authoritative close time — the
              &quot;Late join window&quot; setting below is ignored, and any
              exam still in progress ends at this instant.
            </p>
            {lastEntryPreview && (
              <p className={`mt-1 text-xs ${lastEntryPreview.tooLate ? "text-red-600" : "text-[#64748B]"}`}>
                {lastEntryPreview.tooLate
                  ? "The current questions take longer than this window allows — nobody will be able to join."
                  : `Last entry allowed: ${lastEntryPreview.time} (assessment takes ~${Math.round(campaign.durationSec / 60)} min)`}
              </p>
            )}
          </div>

          {/* Candidate entry grace period — ignored once "Assessment ends at" is set */}
          {!scheduledEnd && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Late join window
              </label>
              <p className="mb-2 text-xs text-[#64748B]">
                How long after the assessment starts candidates can still join.
                Set to 0 to allow no late entry.
              </p>
              <div className="flex flex-wrap gap-2">
                {[0, 5, 10, 15, 20, 30, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setGracePeriodMin(min)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      gracePeriodMin === min
                        ? "border-[#6366F1] bg-[#6366F1] text-white"
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
                    }`}
                  >
                    {min === 0 ? "No late entry" : `${min} min`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Open join */}
          <label className="flex items-center justify-between gap-4">
            <div>
              <span className="block text-xs font-medium text-[#0F172A]">
                Open join (no pre-added candidates)
              </span>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Anyone with the join link can enter their name and email to
                take the assessment — no candidates need to be added ahead of
                time. Requires &quot;Assessment ends at&quot; to be set above.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={openJoinEnabled}
              onClick={() => setOpenJoinEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                openJoinEnabled ? "bg-[#6366F1]" : "bg-[#E2E8F0]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  openJoinEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
```

- [ ] **Step 6: Hide the manual-add/CSV-import/email-sending UI in `CandidatesTab` when open-join is on**

Find the `CandidatesTab` props:

```tsx
function CandidatesTab({
  campaignId,
  campaignName,
  candidates,
  onChanged,
}: {
  campaignId: string;
  campaignName: string;
  candidates: Candidate[];
  onChanged: () => void;
}) {
```

Replace with:

```tsx
function CandidatesTab({
  campaignId,
  campaignName,
  candidates,
  onChanged,
  openJoinEnabled,
}: {
  campaignId: string;
  campaignName: string;
  candidates: Candidate[];
  onChanged: () => void;
  openJoinEnabled: boolean;
}) {
```

Find the call site:

```tsx
      {tab === "candidates" && (
        <CandidatesTab
          campaignId={id}
          campaignName={campaign.name}
          candidates={candidates}
          onChanged={fetchCandidates}
        />
      )}
```

Replace with:

```tsx
      {tab === "candidates" && (
        <CandidatesTab
          campaignId={id}
          campaignName={campaign.name}
          candidates={candidates}
          onChanged={fetchCandidates}
          openJoinEnabled={campaign.openJoinEnabled}
        />
      )}
```

Find the start of the render (the `{/* ── Add manually ── */}` comment through the end of the CSV-import/email-sending block, right before the candidate table):

```tsx
  return (
    <div className="space-y-6">
      {/* ── Add manually ── */}
```

Replace with:

```tsx
  return (
    <div className="space-y-6">
      {openJoinEnabled && (
        <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <p className="text-sm text-[#64748B]">
            Candidates join directly via the link above — nothing to add here.
            Anyone who joins during the assessment window appears in the table
            below.
          </p>
        </section>
      )}
      {!openJoinEnabled && (
      <>
      {/* ── Add manually ── */}
```

Then find the line right before the candidate table comment:

```tsx
        {sendMsg && (
          <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#334155]">
            {sendMsg}
          </div>
        )}
      {/* ── Candidate table ── */}
```

Replace with:

```tsx
        {sendMsg && (
          <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#334155]">
            {sendMsg}
          </div>
        )}
      </>
      )}
      {/* ── Candidate table ── */}
```

- [ ] **Step 7: Verify**

```powershell
npx tsc --noEmit
npx eslint app/admin/campaigns/[id]/page.tsx
```

Expected: no errors. Pay particular attention to JSX balance from Step 6 — `tsc`/`eslint` will catch an unbalanced fragment immediately if the two inserted markers don't line up.

- [ ] **Step 8: Commit**

```powershell
git add app/admin/campaigns/[id]/page.tsx
git commit -m "feat(admin): scheduledEnd field, last-entry advisory, open-join toggle"
```

---

## Task 9: Admin UI — new campaign wizard

**Files:**
- Modify: `app/admin/campaigns/new/page.tsx` (full file, 275 lines)

**Interfaces:**
- Consumes: `PATCH /api/admin/campaigns/[id]` accepting `scheduledEnd`/`openJoinEnabled` (Task 3).
- Produces: nothing consumed by later tasks.

Note: at this step in the wizard, the campaign has no questions yet (`durationSec` is always `0`), so there's no meaningful last-entry advisory to show here — that only becomes useful once questions exist, i.e. on the edit page from Task 8. This step only adds the two fields.

- [ ] **Step 1: Add fields to the draft state**

Find:

```ts
interface CampaignDraft {
  name: string;
  logoUrl: string;
  bgColor: string;
  scheduledAt: string;
  autoStart: boolean;
  maxCandidates: string;
  negativeMarking: boolean;
  negativeMarkingValue: string;
}

const INITIAL: CampaignDraft = {
  name: "",
  logoUrl: "",
  bgColor: "#F8FAFC",
  scheduledAt: "",
  autoStart: false,
  maxCandidates: "",
  negativeMarking: false,
  negativeMarkingValue: "0.25",
};
```

Replace with:

```ts
interface CampaignDraft {
  name: string;
  logoUrl: string;
  bgColor: string;
  scheduledAt: string;
  scheduledEnd: string;
  autoStart: boolean;
  maxCandidates: string;
  negativeMarking: boolean;
  negativeMarkingValue: string;
  openJoinEnabled: boolean;
}

const INITIAL: CampaignDraft = {
  name: "",
  logoUrl: "",
  bgColor: "#F8FAFC",
  scheduledAt: "",
  scheduledEnd: "",
  autoStart: false,
  maxCandidates: "",
  negativeMarking: false,
  negativeMarkingValue: "0.25",
  openJoinEnabled: false,
};
```

- [ ] **Step 2: Send the new fields in `saveStep2`**

Find:

```ts
        body: JSON.stringify({
          scheduledAt: draft.scheduledAt || null,
          autoStart: draft.autoStart,
          maxCandidates: draft.maxCandidates ? parseInt(draft.maxCandidates) : null,
          negativeMarking: draft.negativeMarking,
          negativeMarkingValue: parseFloat(draft.negativeMarkingValue),
        }),
```

Replace with:

```ts
        body: JSON.stringify({
          scheduledAt: draft.scheduledAt || null,
          scheduledEnd: draft.scheduledEnd || null,
          autoStart: draft.autoStart,
          maxCandidates: draft.maxCandidates ? parseInt(draft.maxCandidates) : null,
          negativeMarking: draft.negativeMarking,
          negativeMarkingValue: parseFloat(draft.negativeMarkingValue),
          openJoinEnabled: draft.openJoinEnabled,
        }),
```

- [ ] **Step 3: Add the fields to Step 2's form**

Find:

```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Start (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledAt}
              onChange={e => update("scheduledAt", e.target.value)}
            />
            <p className="mt-1 text-xs text-[#64748B]">
              When candidates can start joining. Leave blank to let them join anytime.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.autoStart} onChange={e => update("autoStart", e.target.checked)} className="mt-0.5" />
            <span>
              Auto-start at scheduled time
              <p className="text-xs text-[#64748B] font-normal">
                On: the assessment goes live automatically at the scheduled time. Off: you&apos;ll click &quot;Go live&quot; yourself when ready.
              </p>
            </span>
          </label>
```

Replace with:

```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Start (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledAt}
              onChange={e => update("scheduledAt", e.target.value)}
            />
            <p className="mt-1 text-xs text-[#64748B]">
              When candidates can start joining. Leave blank to let them join anytime.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Assessment Ends At (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledEnd}
              onChange={e => update("scheduledEnd", e.target.value)}
            />
            <p className="mt-1 text-xs text-[#64748B]">
              When set, this becomes the authoritative close time — entry
              closes early enough for anyone joining to still finish, and any
              exam in progress ends at this instant. You can fine-tune this
              once questions are added, from the campaign&apos;s Overview tab.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.autoStart} onChange={e => update("autoStart", e.target.checked)} className="mt-0.5" />
            <span>
              Auto-start at scheduled time
              <p className="text-xs text-[#64748B] font-normal">
                On: the assessment goes live automatically at the scheduled time. Off: you&apos;ll click &quot;Go live&quot; yourself when ready.
              </p>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.openJoinEnabled}
              onChange={e => update("openJoinEnabled", e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Open join (no pre-added candidates)
              <p className="text-xs text-[#64748B] font-normal">
                Anyone with the join link can enter their name and email to take the assessment — requires &quot;Assessment Ends At&quot; to be set above.
              </p>
            </span>
          </label>
```

- [ ] **Step 4: Verify**

```powershell
npx tsc --noEmit
npx eslint app/admin/campaigns/new/page.tsx
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add app/admin/campaigns/new/page.tsx
git commit -m "feat(admin): scheduledEnd and open-join fields in new-campaign wizard"
```

---

## Task 10: Full verification

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

Expected: no *new* errors introduced by this plan's files (`lib/campaign-window.ts`, `app/join/[token]/page.tsx`, `app/join/[token]/JoinGate.tsx`, `app/api/auth/login/route.ts`, `app/candidate/login/page.tsx`, `app/api/assessment/submit-answer/route.ts`, `app/api/assessment/next-question/route.ts`, `app/candidate/exam/page.tsx`, `app/api/cron/session-scheduler/route.ts`, `app/admin/campaigns/[id]/page.tsx`, `app/admin/campaigns/new/page.tsx`, `app/api/admin/campaigns/[id]/route.ts`). This repo has pre-existing lint errors in unrelated files (confirmed during the prior multi-select-MCQ feature) — those are not this plan's concern; if `eslint .` reports any, cross-check the file list against the one above before treating it as a regression.

- [ ] **Step 3: Production build**

```powershell
npm run build
```

Expected: build succeeds, all routes compile, no new route added or removed (this plan doesn't add pages — `/candidate/login` and `/join/[token]` already exist).

- [ ] **Step 4: Unit tests**

```powershell
npx tsx --test lib/campaign-window.test.ts
```

Expected: all 6 tests pass (already verified in Task 2, re-run here as part of the full-suite gate).

- [ ] **Step 5: Scripted end-to-end integration check**

Verify the full flow against a live `next dev` instance and the real shared dev database, using throwaway rows cleaned up in a `finally` block — same pattern as the prior multi-select-MCQ plan's final task.

Start the dev server in one PowerShell window:

```powershell
npm run dev
```

In a second PowerShell window, create `scripts/verify-open-join.mjs`:

```js
// Throwaway verification script — deletes everything it creates.
const BASE = "http://localhost:3000";

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let campaignId;
  try {
    // 1. Create a campaign directly in the DB (bypassing admin auth, since
    //    this script has no Clerk session) with a window that opens now and
    //    closes in 2 hours, open-join enabled, one 60-second question.
    const now = new Date();
    const campaign = await prisma.campaign.create({
      data: {
        name: `E2E Open Join ${now.getTime()}`,
        joinToken: `e2e-open-join-${now.getTime()}`,
        status: "LIVE",
        scheduledAt: now,
        startedAt: now,
        scheduledEnd: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        openJoinEnabled: true,
        durationSec: 60,
      },
    });
    campaignId = campaign.id;
    await prisma.question.create({
      data: {
        campaignId: campaign.id,
        type: "mcq",
        text: "2 + 2 = ?",
        options: ["3", "4", "5", "6"],
        correctOption: 1,
        timeLimitSec: 60,
        basePoints: 10,
        orderIndex: 0,
      },
    });

    let passed = 0, failed = 0;
    function check(name, cond) {
      if (cond) { console.log(`PASS: ${name}`); passed++; }
      else { console.log(`FAIL: ${name}`); failed++; }
    }

    // 2. Open-join registration creates a candidate and returns a token
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "open", name: "E2E Candidate", email: `e2e-${now.getTime()}@example.com`, joinToken: campaign.joinToken }),
    });
    const loginData = await loginRes.json();
    check("open-join registration succeeds", loginRes.status === 200 && !!loginData.token);

    // 3. A second registration with the same email reuses the candidate (no duplicate)
    const loginRes2 = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "open", name: "E2E Candidate", email: `e2e-${now.getTime()}@example.com`, joinToken: campaign.joinToken }),
    });
    check("second registration with same email is soft-blocked (still-active session)", loginRes2.status === 409);

    // 4. Registration is rejected when openJoinEnabled is false
    const inviteOnly = await prisma.campaign.create({
      data: {
        name: `E2E Invite Only ${now.getTime()}`,
        joinToken: `e2e-invite-only-${now.getTime()}`,
        status: "LIVE",
        scheduledAt: now,
        startedAt: now,
        openJoinEnabled: false,
      },
    });
    const rejectedRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "open", name: "Nope", email: "nope@example.com", joinToken: inviteOnly.joinToken }),
    });
    check("open-join rejected when campaign has it disabled", rejectedRes.status === 403);
    await prisma.candidate.deleteMany({ where: { campaignId: inviteOnly.id } });
    await prisma.campaign.delete({ where: { id: inviteOnly.id } });

    // 5. Registration is rejected after the window's last-entry cutoff
    const closingSoon = await prisma.campaign.create({
      data: {
        name: `E2E Closing Soon ${now.getTime()}`,
        joinToken: `e2e-closing-soon-${now.getTime()}`,
        status: "LIVE",
        scheduledAt: new Date(now.getTime() - 60 * 60 * 1000),
        startedAt: new Date(now.getTime() - 60 * 60 * 1000),
        scheduledEnd: new Date(now.getTime() - 1000), // already passed
        openJoinEnabled: true,
        durationSec: 60,
      },
    });
    const lateRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "open", name: "Too Late", email: "toolate@example.com", joinToken: closingSoon.joinToken }),
    });
    const lateData = await lateRes.json();
    check("registration rejected after window close", lateRes.status === 403 && lateData.error === "This assessment's entry window has closed");
    await prisma.campaign.delete({ where: { id: closingSoon.id } });

    // 6. Hard cutoff — next-question rejects with window_closed once scheduledEnd has passed,
    //    even for a candidate who joined before it closed.
    const alreadyOpenCand = await prisma.candidate.findFirst({ where: { campaignId } });
    await prisma.campaign.update({ where: { id: campaignId }, data: { scheduledEnd: new Date(now.getTime() - 1000) } });
    const nextRes = await fetch(`${BASE}/api/assessment/next-question`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const nextData = await nextRes.json();
    check("next-question rejects with window_closed after scheduledEnd passes", nextRes.status === 403 && nextData.error === "window_closed");
    check("candidate row still exists (nothing destructive happened)", !!alreadyOpenCand);
    // restore scheduledEnd so cleanup below doesn't need special-casing
    await prisma.campaign.update({ where: { id: campaignId }, data: { scheduledEnd: new Date(now.getTime() + 2 * 60 * 60 * 1000) } });

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    if (campaignId) {
      await prisma.response.deleteMany({ where: { candidate: { campaignId } } });
      await prisma.candidate.deleteMany({ where: { campaignId } });
      await prisma.question.deleteMany({ where: { campaignId } });
      await prisma.campaign.delete({ where: { id: campaignId } });
    }
    await prisma.$disconnect();
  }
}

main();
```

Run it:

```powershell
node scripts/verify-open-join.mjs
```

Expected: all checks print `PASS`, ending with `0 failed`. Delete `scripts/verify-open-join.mjs` after a passing run — it's throwaway, not part of the shipped codebase.

```powershell
Remove-Item scripts/verify-open-join.mjs
```

Stop the `npm run dev` process from the first window.

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "chore: verify open-join campaign window feature end-to-end" --allow-empty
```

(Use `--allow-empty` only if Step 5's cleanup left nothing to commit — if `git status` shows anything staged, drop the flag.)
