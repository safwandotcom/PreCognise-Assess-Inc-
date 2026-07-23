# Per-Admin Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Clerk admin user an isolated PreCognise Assess account — their own campaigns, candidates, questions, results, branding, and settings — with no cross-tenant visibility.

**Architecture:** Add `ownerId` (the Clerk user id) to `Campaign`, `OrgBranding`, `AssessmentSettings`; apply via `prisma db push`. Add tenant helpers (`getOwnerId`, `ownedCampaign`), scope/verify every admin route, resolve candidate-facing branding & settings from the campaign owner, and backfill existing data to the primary admin.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres (Neon), Clerk (`@clerk/nextjs ^7.5.3`). No test framework — verification is `npx tsc --noEmit -p .`, a production `next build`, throwaway scripts, and a manual two-account walkthrough.

## Global Constraints

- **The isolation invariant (non-negotiable):** every Prisma query in `app/api/admin/**` must be either (a) filtered by the caller's `ownerId`, or (b) gated behind an ownership check that 404s when the target campaign's `ownerId` ≠ caller. No admin route may read or write data it hasn't confirmed the caller owns.
- Owner = Clerk `userId` from `const { userId } = await auth()` (`@clerk/nextjs/server`, async).
- `ownerId` is **nullable at the DB level** but **required in app logic**: every create stamps it; every read filters by it. A NULL-owner row is invisible to everyone.
- Cross-tenant access by URL/id must return **404** (not 403 — don't confirm existence).
- Candidates see **the campaign owner's** branding & settings — never a global-first record. Resolve owner via `?token=<joinToken>` (pre-login) or the candidate JWT (post-login).
- Use `prisma db push` for the schema change (sidesteps the Neon `_prisma_migrations` drift); review its planned diff and abort if it proposes anything beyond adding the three nullable columns + index.
- Repo's Bash shell has no `node`/`npx`/`prisma` on PATH — run those via PowerShell.
- Spec reference: `docs/superpowers/specs/2026-07-24-multi-tenancy-design.md`

---

## Task 1: Schema — add `ownerId`, apply with db push

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Campaign.ownerId`, `OrgBranding.ownerId`, `AssessmentSettings.ownerId` (all `String?`), and a `Campaign` index on `ownerId`. Consumed by every later task.

- [ ] **Step 1: Add the columns**

In `prisma/schema.prisma`:

In `model Campaign { ... }`, add after the `id` line (`id String @id @default(cuid())`):
```
  ownerId                    String?
```
and add at the end of the model body (before the closing `}`, after the relations):
```
  @@index([ownerId])
```

In `model OrgBranding { ... }`, add after its `id` line:
```
  ownerId       String?
```

In `model AssessmentSettings { ... }`, add after its `id` line:
```
  ownerId              String?
```

- [ ] **Step 2: Apply with db push + regenerate the client**

Run (PowerShell):
```powershell
npx prisma db push
```
Expected: Prisma reports adding the `ownerId` columns to `Campaign`, `OrgBranding`, `AssessmentSettings` (and the index), then "Your database is now in sync" and regenerates the client. **If it proposes to drop or alter anything else, STOP and report** — do not accept destructive changes. (Adding nullable columns to populated tables is safe.)

- [ ] **Step 3: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors (the generated client now has `ownerId` on the three models).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
feat(schema): add ownerId to Campaign, OrgBranding, AssessmentSettings

Nullable owner column (Clerk user id) on the three tenant-scoped
models, applied via prisma db push to sidestep the Neon migration
drift. App logic treats ownerId as required; a NULL-owner row is
invisible to everyone. Backfill of existing rows happens in a later task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tenant helpers

**Files:**
- Create: `lib/tenant.ts`

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server`, `prisma`.
- Produces:
  - `getOwnerId(): Promise<string | null>` — the caller's Clerk user id, or null.
  - `ownedCampaign(id: string, ownerId: string)` — the campaign if owned by `ownerId`, else `null`.

- [ ] **Step 1: Write the file**

Create `lib/tenant.ts`:
```ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// The current admin's Clerk user id (the tenant owner), or null if unauthenticated.
export async function getOwnerId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

// Returns the campaign only if it belongs to `ownerId`; otherwise null.
// Both fetches and verifies ownership in one query — use this in every
// admin /[id] route instead of a bare findUnique({ where: { id } }).
export async function ownedCampaign(id: string, ownerId: string) {
  return prisma.campaign.findFirst({ where: { id, ownerId } });
}
```

- [ ] **Step 2: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/tenant.ts
git commit -m "$(cat <<'EOF'
feat: tenant helpers — getOwnerId and ownedCampaign

getOwnerId reads the current Clerk user id; ownedCampaign fetches a
campaign only when it belongs to that owner (else null), the building
block for scoping every admin route.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Per-owner branding & settings helpers

**Files:**
- Create: `lib/branding.ts`
- Modify: `lib/get-settings.ts`

**Interfaces:**
- Produces:
  - `getBrandingForOwner(ownerId: string)` — the owner's `OrgBranding` row, created with defaults if absent.
  - `getSettings(ownerId: string)` — the owner's `AssessmentSettings` (was zero-arg global). Return shape unchanged.

- [ ] **Step 1: Create `lib/branding.ts`**

```ts
import { prisma } from "@/lib/prisma";

// The owner's branding row, created with schema defaults if they don't have one yet.
export async function getBrandingForOwner(ownerId: string) {
  let branding = await prisma.orgBranding.findFirst({ where: { ownerId } });
  if (!branding) {
    branding = await prisma.orgBranding.create({ data: { ownerId } });
  }
  return branding;
}
```

- [ ] **Step 2: Make `getSettings` per-owner**

In `lib/get-settings.ts`, replace the `getSettings` function:
```ts
export async function getSettings(): Promise<AssessmentSettings> {
  let row = await prisma.assessmentSettings.findFirst();
  if (!row) {
    row = await prisma.assessmentSettings.create({ data: {} });
  }
```
with:
```ts
export async function getSettings(ownerId: string): Promise<AssessmentSettings> {
  let row = await prisma.assessmentSettings.findFirst({ where: { ownerId } });
  if (!row) {
    row = await prisma.assessmentSettings.create({ data: { ownerId } });
  }
```
(The rest of the function body — the returned object — is unchanged.)

- [ ] **Step 3: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: **errors are expected here** — every current caller of `getSettings()` now fails to type-check because the argument is missing. That's the signal for which callers Tasks 8–9 must fix. Note the failing call sites from the output; do NOT fix them in this task. This task's deliverable is the two helpers; the callers are updated in their own tasks. (If you prefer a green tree per task, do Tasks 8 and 9 immediately after this one before re-running a full type-check — but the commit for THIS task may show known caller errors, which the reviewer should expect.)

- [ ] **Step 4: Commit**

```bash
git add lib/branding.ts lib/get-settings.ts
git commit -m "$(cat <<'EOF'
feat: per-owner branding & settings helpers

getBrandingForOwner returns/creates an owner's OrgBranding row;
getSettings now takes an ownerId and reads/creates that owner's
AssessmentSettings. Callers are updated in later tasks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Admin campaigns — list, create, detail

**Files:**
- Modify: `app/api/admin/campaigns/route.ts`
- Modify: `app/api/admin/campaigns/[id]/route.ts`

**Interfaces:**
- Consumes: `getOwnerId`, `ownedCampaign` (Task 2); `uniqueJoinSlug` (already imported in create).
- Produces: the archetype every other admin route follows.

- [ ] **Step 1: Scope the campaigns list + stamp owner on create**

In `app/api/admin/campaigns/route.ts`, add the import:
```ts
import { getOwnerId } from "@/lib/tenant";
```
In `GET`, before the `findMany`, add owner resolution and filter the query:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaigns = await prisma.campaign.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: true, questions: true } } },
    });
```
In `POST`, after resolving `name`/validating and before `prisma.campaign.create`, resolve owner and stamp it. Add at the top of the `try`:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
and add `ownerId,` into the `data: { ... }` object of `campaign.create` (alongside `name`, `joinToken`).

- [ ] **Step 2: Verify ownership on the detail route**

In `app/api/admin/campaigns/[id]/route.ts`, add:
```ts
import { getOwnerId, ownedCampaign } from "@/lib/tenant";
```
In **GET**, replace the `findUnique({ where: { id } })` lookup with an ownership-checked fetch. Change:
```ts
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { candidates: true, questions: true } },
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
```
to:
```ts
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const owned = await ownedCampaign(id, ownerId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { candidates: true, questions: true } },
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
```
In **PATCH** and **DELETE**, the existing code opens with `const existing = await prisma.campaign.findUnique({ where: { id }, select: {...} })` (or similar) and 404s if missing. Change each such lookup to resolve owner first and use `ownedCampaign(id, ownerId)`:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const existing = await ownedCampaign(id, ownerId);
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
```
(`ownedCampaign` returns the full campaign row, so any fields PATCH reads from `existing` — e.g. `status`, `name` for the slug-regeneration logic — are present.) Everything after the ownership check is unchanged.

- [ ] **Step 3: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors in these two files.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/campaigns/route.ts" "app/api/admin/campaigns/[id]/route.ts"
git commit -m "$(cat <<'EOF'
feat(tenancy): scope campaigns list/create/detail to the owner

Campaigns list filters by ownerId; create stamps the current Clerk
user as owner; detail/patch/delete verify ownership via ownedCampaign
and 404 for campaigns the caller doesn't own.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Admin campaign sub-routes — verify ownership of the parent

**Files (all under `app/api/admin/campaigns/[id]/`):**
- Modify: `candidates/route.ts` (GET, POST)
- Modify: `candidates/import/route.ts` (POST)
- Modify: `candidates/send-credentials/route.ts` (POST)
- Modify: `questions/route.ts` (GET, POST)
- Modify: `results/route.ts` (GET)
- Modify: `analytics/route.ts` (GET)
- Modify: `broadcast/route.ts` (POST)
- Modify: `start/route.ts`, `pause/route.ts`, `end/route.ts` (POST)

**Interfaces:**
- Consumes: `getOwnerId`, `ownedCampaign` (Task 2), `getBrandingForOwner` (Task 3, for send-credentials only).

**Pattern for every route in this task:** each already receives the campaign `id` from `params`. At the very top of the handler's `try` (after `const { id } = await params;`), insert:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const campaign = await ownedCampaign(id, ownerId);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
```
Then **reuse this `campaign`** wherever the route currently did its own `prisma.campaign.findUnique({ where: { id } })` — delete that now-redundant lookup (and its separate 404). Add the import `import { getOwnerId, ownedCampaign } from "@/lib/tenant";` to each file.

- [ ] **Step 1: candidates/route.ts** — GET (`findMany({ where: { campaignId: id } })`) and POST (manual add): add the ownership guard at top; the existing `campaign` lookup in POST is replaced by the guarded `campaign`. The candidate queries stay filtered by `campaignId: id` (now proven owned).

- [ ] **Step 2: candidates/import/route.ts** — add the guard; replace its `prisma.campaign.findUnique({ where: { id } })` with the guarded `campaign`.

- [ ] **Step 3: candidates/send-credentials/route.ts** — add the guard; replace its campaign lookup with the guarded `campaign`. **Also fix the branding leak:** replace `const branding = await prisma.orgBranding.findFirst();` with `const branding = await getBrandingForOwner(ownerId);` (import `getBrandingForOwner` from `@/lib/branding`). This ensures the candidate email uses *this owner's* branding, not a global-first record.

- [ ] **Step 4: questions/route.ts** — add the guard; GET/POST queries stay `campaignId: id` (proven owned); the `campaign.durationSec` update stays scoped to `id`.

- [ ] **Step 5: results/route.ts** — add the guard; reuse the guarded `campaign` for the results query.

- [ ] **Step 6: analytics/route.ts** — add the guard before its aggregate queries.

- [ ] **Step 7: broadcast/route.ts** — add the guard.

- [ ] **Step 8: start/route.ts, pause/route.ts, end/route.ts** — add the guard; the existing `update({ where: { id } })` stays (now proven owned).

- [ ] **Step 9: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors across these files.

- [ ] **Step 10: Commit**

```bash
git add "app/api/admin/campaigns/[id]/candidates" "app/api/admin/campaigns/[id]/questions" "app/api/admin/campaigns/[id]/results" "app/api/admin/campaigns/[id]/analytics" "app/api/admin/campaigns/[id]/broadcast" "app/api/admin/campaigns/[id]/start" "app/api/admin/campaigns/[id]/pause" "app/api/admin/campaigns/[id]/end"
git commit -m "$(cat <<'EOF'
feat(tenancy): verify campaign ownership on all campaign sub-routes

Every /admin/campaigns/[id]/* route now 404s unless the caller owns
the campaign, and send-credentials emails use the owner's branding
instead of a global-first record.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin by-id routes — verify via the parent campaign

**Files:**
- Modify: `app/api/admin/campaigns/[id]/candidates/[candidateId]/route.ts` (DELETE)
- Modify: `app/api/admin/questions/[id]/route.ts` (PATCH, DELETE)
- Modify: `app/api/admin/questions/reorder/route.ts` (POST)
- Modify: `app/api/admin/disqualify/route.ts` (POST)

**Interfaces:**
- Consumes: `getOwnerId`, `ownedCampaign`.

**Pattern:** these operate on a candidate/question by id. Resolve the row's `campaignId`, then verify that campaign is owned; 404 otherwise.

- [ ] **Step 1: candidates/[candidateId]/route.ts (DELETE)** — it already has the campaign `id` from params and checks `candidate.campaignId === id`. Add the ownership guard at top (`getOwnerId` + `ownedCampaign(id, ownerId)` → 404) before touching the candidate.

- [ ] **Step 2: questions/[id]/route.ts (PATCH, DELETE)** — add:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const q = await prisma.question.findUnique({ where: { id }, select: { campaignId: true } });
    if (!q || !(await ownedCampaign(q.campaignId, ownerId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```
before the existing update/delete.

- [ ] **Step 3: questions/reorder/route.ts (POST)** — the body carries question ids (and/or a campaignId). Resolve the campaign for the reordered questions (look up one question's `campaignId`, or use a `campaignId` in the body if present), verify `ownedCampaign`, and confirm every question being reordered belongs to that same owned campaign (`updateMany`/reorder must be constrained to `campaignId`). 404 if the campaign isn't owned.

- [ ] **Step 4: disqualify/route.ts (POST)** — currently `candidate.update({ where: { id: candidateId } })` with no scope. Add:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cand = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { campaignId: true } });
    if (!cand || !(await ownedCampaign(cand.campaignId, ownerId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
```
before the update.

- [ ] **Step 5: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/campaigns/[id]/candidates/[candidateId]/route.ts" "app/api/admin/questions/[id]/route.ts" "app/api/admin/questions/reorder/route.ts" "app/api/admin/disqualify/route.ts"
git commit -m "$(cat <<'EOF'
feat(tenancy): verify ownership on candidate/question by-id routes

Delete-candidate, question patch/delete/reorder, and disqualify now
resolve the row's campaign and 404 unless the caller owns it — closing
the un-scoped by-id writes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin stats — owner-filtered

**Files:**
- Modify: `app/api/admin/stats/route.ts`

**Interfaces:**
- Consumes: `getOwnerId`.

- [ ] **Step 1: Filter every count by the owner's campaigns**

Add `import { getOwnerId } from "@/lib/tenant";`. At the top of `GET`'s `try`:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
Then constrain every candidate count/aggregate to the owner's campaigns by adding `campaign: { ownerId }` (a relation filter) to each `prisma.candidate.count({ where: { ... } })` / aggregate `where`. For a status count, e.g.:
```ts
    prisma.candidate.count({ where: { status: "ACTIVE", campaign: { ownerId } } })
```
Apply the `campaign: { ownerId }` filter to the total and every per-status count so the dashboard shows only this admin's numbers.

- [ ] **Step 2: Type-check** — Run (PowerShell): `npx tsc --noEmit -p .`; expected no errors (the `campaign` relation filter is valid on `Candidate`).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/stats/route.ts
git commit -m "$(cat <<'EOF'
feat(tenancy): scope admin dashboard stats to the owner

Every candidate count is filtered by campaign.ownerId so the dashboard
totals reflect only the logged-in admin's candidates.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Admin branding & settings routes — per-owner

**Files:**
- Modify: `app/api/admin/branding/route.ts` (GET, PUT)
- Modify: `app/api/admin/settings/route.ts` (GET, PUT)

**Interfaces:**
- Consumes: `getOwnerId`, `getBrandingForOwner`, `getSettings(ownerId)`.

- [ ] **Step 1: Branding route per-owner**

In `app/api/admin/branding/route.ts`, add imports:
```ts
import { getOwnerId } from "@/lib/tenant";
import { getBrandingForOwner } from "@/lib/branding";
```
Delete the local `getOrCreate()` helper. Rewrite:

`GET`:
```ts
export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const branding = await getBrandingForOwner(ownerId);
    return NextResponse.json({ branding });
  } catch (err) {
    console.error("GET /api/admin/branding error:", err);
    return NextResponse.json({ error: "Failed to load branding" }, { status: 500 });
  }
}
```

`PUT`: resolve `ownerId` first; validate `orgName`; then update this owner's row (create if absent):
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgName, tagline, logoUrl, primaryColour } = await req.json();
    if (!orgName?.trim()) {
      return NextResponse.json({ error: "orgName is required" }, { status: 400 });
    }
    const existing = await prisma.orgBranding.findFirst({ where: { ownerId } });
    const data = {
      orgName: orgName.trim(),
      tagline: tagline?.trim() ?? "",
      logoUrl: logoUrl?.trim() || null,
      primaryColour: primaryColour ?? "#3730A3",
    };
    const branding = existing
      ? await prisma.orgBranding.update({ where: { id: existing.id }, data })
      : await prisma.orgBranding.create({ data: { ...data, ownerId } });
    return NextResponse.json({ branding });
```

- [ ] **Step 2: Settings route per-owner**

In `app/api/admin/settings/route.ts`, add `import { getOwnerId } from "@/lib/tenant";`.

`GET`:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const settings = await getSettings(ownerId);
```

`PUT`: resolve `ownerId` first; then scope the find/update to the owner:
```ts
    const ownerId = await getOwnerId();
    if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```
Change `const existing = await prisma.assessmentSettings.findFirst();` to `const existing = await prisma.assessmentSettings.findFirst({ where: { ownerId } });`, and change the create branch from `create({ data })` to `create({ data: { ...data, ownerId } })`.

- [ ] **Step 3: Type-check** — Run (PowerShell): `npx tsc --noEmit -p .`; expected no errors in these files (the `getSettings(ownerId)` call now matches Task 3's signature).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/branding/route.ts app/api/admin/settings/route.ts
git commit -m "$(cat <<'EOF'
feat(tenancy): per-owner admin branding & settings

Each admin reads/writes their own OrgBranding and AssessmentSettings
row, keyed by their Clerk user id.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Candidate-facing branding & settings resolution

**Files:**
- Modify: `app/api/branding/route.ts` (public)
- Modify: `app/api/settings/route.ts` (public)
- Modify: `lib/use-branding.ts`
- Modify: `app/api/assessment/submit-answer/route.ts`
- Modify: `app/api/assessment/next-question/route.ts`

**Interfaces:**
- Consumes: `getBrandingForOwner`, `getSettings(ownerId)`, `verifyToken` (from `@/lib/jwt`), `prisma`.
- Produces: candidate branding/settings resolved from `campaign.ownerId`.

- [ ] **Step 1: A shared owner-from-request resolver (inline in `/api/branding` and `/api/settings`)**

Both public routes need "who owns the campaign this candidate is interacting with." Resolve it from either a `?token=<joinToken>` query param or a candidate Bearer JWT. In each of `app/api/branding/route.ts` and `app/api/settings/route.ts`, add a helper at module scope:
```ts
import { verifyToken } from "@/lib/jwt";

async function ownerFromRequest(req: NextRequest): Promise<{ ownerId: string | null; campaign: { logoUrl: string | null; bgColor: string; name: string } | null }> {
  const joinToken = req.nextUrl.searchParams.get("token");
  if (joinToken) {
    const campaign = await prisma.campaign.findUnique({
      where: { joinToken },
      select: { ownerId: true, logoUrl: true, bgColor: true, name: true },
    });
    if (campaign) return { ownerId: campaign.ownerId, campaign };
  }
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (bearer) {
    try {
      const { campaignId } = verifyToken(bearer);
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerId: true, logoUrl: true, bgColor: true, name: true },
      });
      if (campaign) return { ownerId: campaign.ownerId, campaign };
    } catch { /* invalid/expired token → no owner context */ }
  }
  return { ownerId: null, campaign: null };
}
```

- [ ] **Step 2: `/api/branding` returns the owner's branding**

Rewrite the `GET` body of `app/api/branding/route.ts` to use the resolver:
```ts
    const { ownerId, campaign } = await ownerFromRequest(req);
    if (ownerId) {
      const branding = await getBrandingForOwner(ownerId);
      return NextResponse.json({
        orgName: branding.orgName,
        primaryColour: branding.primaryColour,
        logoUrl: campaign?.logoUrl ?? branding.logoUrl ?? null,
        bgColor: campaign?.bgColor ?? "#F8FAFC",
      });
    }
    return NextResponse.json({ orgName: "PreCognise", primaryColour: "#6366F1", logoUrl: null, bgColor: "#F8FAFC" });
```
(Import `getBrandingForOwner` from `@/lib/branding`. Keep the outer `try/catch` returning the neutral default on error.)

- [ ] **Step 3: `/api/settings` returns the owner's settings**

In `app/api/settings/route.ts`, use `ownerFromRequest(req)`; if `ownerId`, return `getSettings(ownerId)`; else return the `SETTINGS_DEFAULTS` (import from `@/lib/get-settings`) so a candidate with no resolvable owner still gets sane defaults rather than a 500. Ensure the handler signature takes `req: NextRequest`.

- [ ] **Step 4: `use-branding.ts` sends the candidate JWT post-login**

In `lib/use-branding.ts`, when no explicit `token` is passed, attach the stored candidate JWT as a Bearer header so post-login pages (waiting-room, instructions, exam) resolve the right owner. Read the token via the existing auth store (`getToken` from `@/lib/auth-store`). Build the fetch as: if a `token` arg is given, call `/api/branding?token=${token}`; else if `getToken()` returns a JWT, call `/api/branding` with `headers: { Authorization: \`Bearer ${jwt}\` }`; else call `/api/branding` plain. (Match the hook's existing structure; only the fetch URL/headers change.)

- [ ] **Step 5: Assessment routes pass the campaign owner to `getSettings`**

In `app/api/assessment/submit-answer/route.ts`, the handler already loads the candidate's campaign (via `question.campaign` / candidate lookup around lines 58-67). Change the `getSettings()` call to `getSettings(campaign.ownerId)` — using whatever variable already holds the campaign (ensure `ownerId` is in its `select`; add `ownerId: true` to that select if needed). If `campaign.ownerId` is null (legacy), fall back so scoring still runs — e.g. `getSettings(campaign.ownerId ?? "")` returns that owner's/default settings (a `""` owner yields a default row); acceptable since backfill removes null owners.

In `app/api/assessment/next-question/route.ts`, the geo-restriction check calls `getSettings()` (around line 55) after loading the candidate's campaign (lines 27-41). Change it to `getSettings(campaign.ownerId ?? "")`, adding `ownerId` to the campaign `select` if not already present.

- [ ] **Step 6: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors — this is the task that resolves the `getSettings` signature errors surfaced in Task 3.

- [ ] **Step 7: Commit**

```bash
git add app/api/branding/route.ts app/api/settings/route.ts lib/use-branding.ts app/api/assessment/submit-answer/route.ts app/api/assessment/next-question/route.ts
git commit -m "$(cat <<'EOF'
feat(tenancy): candidates see the campaign owner's branding & settings

Public /api/branding and /api/settings resolve the owner from the join
token (pre-login) or the candidate JWT (post-login); use-branding sends
the JWT post-login; the assessment routes read the campaign owner's
settings. Candidates now see their campaign owner's brand, never a
global-first record.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Seed — drop ownerless singletons

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:** none.

- [ ] **Step 1: Remove the global branding/settings upserts**

In `prisma/seed.ts`, delete the `OrgBranding` upsert (the `id: "seed-org-branding"` block) and the `AssessmentSettings` upsert (`id: "seed-assessment-settings"` block). Branding and settings are now created per-owner on demand by the helpers. Leave any other seed logic intact. If removing them leaves unused imports/vars, remove those too.

- [ ] **Step 2: Type-check** — Run (PowerShell): `npx tsc --noEmit -p .`; expected no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "$(cat <<'EOF'
chore: stop seeding global branding/settings singletons

Branding and settings are now created per owner on demand; the
ownerless seed rows no longer make sense.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Backfill existing data to the primary admin

**Files:**
- Create (temporary, deleted after run): `_backfill_owner.mjs`

**Interfaces:**
- Consumes: `clerkClient` (`@clerk/nextjs/server`), `prisma`. Requires `CLERK_SECRET_KEY` + `DATABASE_URL` in the environment (present in `.env.local`).

- [ ] **Step 1: Write the backfill script**

Create `_backfill_owner.mjs`:
```js
import { PrismaClient } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";

const EMAIL = "towfiq@veita.ai";
const prisma = new PrismaClient();

const client = await clerkClient();
const { data: users } = await client.users.getUserList({ emailAddress: [EMAIL] });
if (!users.length) {
  console.error(`No Clerk user found for ${EMAIL}. Add/sign in that admin in Clerk first, then re-run.`);
  process.exit(1);
}
const ownerId = users[0].id;
console.log(`Owner: ${EMAIL} -> ${ownerId}`);

const c = await prisma.campaign.updateMany({ where: { ownerId: null }, data: { ownerId } });
console.log(`Campaigns assigned: ${c.count}`);

const b = await prisma.orgBranding.updateMany({ where: { ownerId: null }, data: { ownerId } });
console.log(`OrgBranding rows assigned: ${b.count}`);

const s = await prisma.assessmentSettings.updateMany({ where: { ownerId: null }, data: { ownerId } });
console.log(`AssessmentSettings rows assigned: ${s.count}`);

console.log("Backfill complete.");
await prisma.$disconnect();
```

- [ ] **Step 2: Run it**

Run (PowerShell): `npx tsx _backfill_owner.mjs`
Expected: prints the resolved owner id and the counts of campaigns/branding/settings assigned. **If it reports "No Clerk user found"**, the primary admin hasn't been created/logged-in in Clerk yet — do that, then re-run. Do not proceed to delete the script until it has run successfully.

- [ ] **Step 3: Delete the script**

```bash
rm _backfill_owner.mjs
```

- [ ] **Step 4: Commit (record that backfill ran)**

No code change to commit (the script is deleted; data is in the DB). Record completion in the progress ledger instead. If the tree is dirty only from the deleted script, there is nothing to commit — skip.

---

## Task 12: Verification + data-isolation security review

**Files:** none (verification only)

- [ ] **Step 1: Full type-check** — Run (PowerShell): `npx tsc --noEmit -p .`; expected zero errors.

- [ ] **Step 2: Production build** — stop any dev server first, then Run (PowerShell): `npx next build`; expected exit 0 (compiles + lints).

- [ ] **Step 3: Grep sweep for un-scoped admin queries**

```bash
grep -rn "prisma\.\(campaign\|candidate\|question\|response\|orgBranding\|assessmentSettings\)\." --include="*.ts" app/api/admin
```
For every hit, confirm it is either filtered by `ownerId` / a `campaign: { ownerId }` relation filter, or preceded by an `ownedCampaign` / ownership check in the same handler. Any bare `findUnique({ where: { id } })` or unfiltered `findMany`/`count` on tenant data is a leak — fix it in the task that introduced the file.

Also confirm every `app/api/admin/**` route calls `getOwnerId` and 401s when null:
```bash
grep -rLn "getOwnerId" --include="*.ts" app/api/admin
```
Expected: no route files listed (every admin route references `getOwnerId`). Investigate any that are.

- [ ] **Step 4: Dispatch the data-isolation review**

This is the required security gate from the spec. Have a reviewer read the whole branch diff and specifically verify:
- Every admin route resolves `ownerId` and 401s when absent.
- Every read/write of Campaign/Candidate/Question/Response in admin routes is owner-scoped or ownership-verified; every `/[id]`, candidate-by-id, and question-by-id route 404s for a non-owned campaign.
- `stats` counts are owner-filtered; `send-credentials` uses `getBrandingForOwner`.
- Candidate `/api/branding` and `/api/settings` resolve owner strictly from `campaign.ownerId` (joinToken or JWT) and never fall back to a global-first tenant record for a real candidate.
- No new cross-tenant path was introduced.
The review must return clean before the branch is done.

- [ ] **Step 5: Manual two-account walkthrough**

In the dev app: add a second admin email in Clerk; log in as each in separate browsers. Confirm each sees only their own campaigns/stats/branding/settings; that Admin A gets 404 opening Admin B's `/admin/campaigns/<id>` (and its API routes); and that a candidate joining A's campaign sees A's branding while a candidate in B's sees B's.

- [ ] **Step 6: No commit** — verification only; fix any finding in the task that introduced it and re-commit there.
