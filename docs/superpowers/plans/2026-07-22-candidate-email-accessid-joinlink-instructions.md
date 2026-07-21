# Candidate Emailing, Simpler Access IDs & Join Links, Anti-Cheat Instructions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins send/resend credential emails (with join link + Access ID + password) from the candidate list; pad Access IDs by the campaign's candidate limit instead of six zeros; make the join link a readable campaign-name slug; and render the candidate instructions page from the admin's actual anti-cheat selections.

**Architecture:** No new subsystems. Changes are: one shared util signature change (`makeAccessId`), a Prisma schema/data change for `joinToken` (slug), an email-module refactor (join link + throttled batch sender), one new API route (send-credentials), decoupling email from CSV import, candidate-list UI (row selection + email actions + upload prompt), and expanding the instructions API + page to cover all anti-cheat fields.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres (Neon), Resend, Clerk admin auth, Tailwind (inline classes). No test framework exists in this repo — verification is `npx tsc --noEmit -p .` plus manual dev-server exercise, matching the project convention.

## Global Constraints

- Existing candidates keep their current `RELA-000001`-style Access IDs; only newly generated IDs change format.
- Renaming a campaign must NOT regenerate its join slug unless the campaign is still `DRAFT` — never invalidate a live campaign's already-distributed link.
- CSV import must no longer auto-send email; emailing is a separate, explicit action.
- One "Email selected" request is capped at 200 recipient candidate IDs; the route rejects more and the UI disables past the cap. No background queue (out of scope).
- Access ID prefix rule is unchanged: first 4 alphanumerics of the campaign name, uppercased, right-padded with `X` to length 4.
- Shuffle anti-cheat settings are deliberately NOT surfaced as candidate instruction rules.
- This repo's Bash shell has no `node` on PATH — run `npx`/`node`/`prisma` commands via PowerShell.
- Spec reference: `docs/superpowers/specs/2026-07-22-candidate-email-accessid-joinlink-instructions-design.md`

**Execution order note:** Tasks are ordered for compile-safety. In particular Task 3 (remove email from import) runs before Task 4 (rename the email field), so no task leaves the tree failing `tsc`.

---

## Task 1: Access ID padding by candidate limit

**Files:**
- Modify: `lib/campaign-utils.ts` (`makeAccessId`)
- Modify: `app/api/admin/campaigns/[id]/candidates/route.ts` (manual-add call site + GET sort)
- Modify: `app/api/admin/campaigns/[id]/candidates/import/route.ts` (bulk call site)
- Modify: `app/candidate/login/page.tsx` (placeholder + helper text)

**Interfaces:**
- Consumes: nothing.
- Produces: `makeAccessId(campaignName: string, seq: number, maxCandidates: number | null): string`. Both candidate-creation routes call it with the campaign's `maxCandidates`.

- [ ] **Step 1: Change `makeAccessId` to pad by candidate-limit width**

In `lib/campaign-utils.ts`, replace the existing function (the comment block above it plus the function):
```ts
// Access ID: first 4 alpha chars of campaign name uppercased, padded to 4 with 'X', then '-', then 6-digit zero-padded seq
// Example: "Relationship Manager RBC" → "RELA-000001"
export function makeAccessId(campaignName: string, seq: number): string {
  const prefix = campaignName
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}
```
with:
```ts
// Access ID: first 4 alphanumerics of campaign name uppercased, padded to 4 with 'X', then '-',
// then the sequence number padded to the width of the campaign's candidate limit (no padding when unlimited).
// Examples: limit 500 → "RELA-001"; no limit → "RELA-1".
export function makeAccessId(campaignName: string, seq: number, maxCandidates: number | null): string {
  const prefix = campaignName
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const width = maxCandidates ? String(maxCandidates).length : 0;
  return `${prefix}-${String(seq).padStart(width, '0')}`;
}
```
(`nextAccessSeq` below it is unchanged — its `/-(\d+)$/` reads the trailing number regardless of padding.)

- [ ] **Step 2: Update the manual-add call site + numeric sort**

In `app/api/admin/campaigns/[id]/candidates/route.ts`:

Find the manual-add accessId line in the `POST` handler:
```ts
    const accessId = makeAccessId(campaign.name, nextSeq);
```
Replace with:
```ts
    const accessId = makeAccessId(campaign.name, nextSeq, campaign.maxCandidates);
```

Then fix the `GET` handler's ordering. Find:
```ts
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
    orderBy: { accessId: "asc" },
  });
  return NextResponse.json({ candidates });
```
Replace with (drop the string `orderBy`, sort numerically by the trailing sequence so `RELA-10` follows `RELA-2` regardless of padding):
```ts
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
```

- [ ] **Step 3: Update the bulk-import call site**

In `app/api/admin/campaigns/[id]/candidates/import/route.ts`, find:
```ts
        const accessId = makeAccessId(campaign.name, seq);
```
Replace with:
```ts
        const accessId = makeAccessId(campaign.name, seq, campaign.maxCandidates);
```

- [ ] **Step 4: Update the login-page format hint**

In `app/candidate/login/page.tsx`, find the Access ID input placeholder and helper:
```tsx
                placeholder="RELA-000001"
```
Replace with:
```tsx
                placeholder="RELA-001"
```
And find:
```tsx
              <p className="mt-1 text-xs text-[#64748B]">
                Format: 4 letters, a dash, then 6 digits — e.g. RELA-000001. This was sent to you by email.
              </p>
```
Replace with:
```tsx
              <p className="mt-1 text-xs text-[#64748B]">
                Your Access ID was emailed to you — e.g. RELA-001.
              </p>
```

- [ ] **Step 5: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

In the dev app: on a campaign with Candidate limit 500, add a candidate → Access ID reads `RELA-00N` (3-digit pad). On a campaign with no limit, add a candidate → `RELA-N` (no pad). Add ≥10 candidates and confirm the table lists them 1,2,…,9,10 in order (not 1,10,2).

- [ ] **Step 7: Commit**

```bash
git add lib/campaign-utils.ts "app/api/admin/campaigns/[id]/candidates/route.ts" "app/api/admin/campaigns/[id]/candidates/import/route.ts" app/candidate/login/page.tsx
git commit -m "$(cat <<'EOF'
feat: pad access IDs by candidate limit, sort candidates numerically

makeAccessId now pads the sequence to the width of the campaign's
candidate limit (RELA-001 for a 500 limit; RELA-1 when unlimited)
instead of a fixed six zeros. Candidate listing sorts numerically by
the trailing sequence so 10 follows 2. Existing IDs are untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Join link as a campaign-name slug

**Files:**
- Create: `lib/join-slug.ts` (`uniqueJoinSlug`)
- Modify: `prisma/schema.prisma` (`joinToken` default)
- Create: `prisma/migrations/<timestamp>_joinToken_no_default/migration.sql` (generated)
- Create: `_backfill_join_slugs.mjs` (temporary one-off, deleted after run)
- Modify: `app/api/admin/campaigns/route.ts` (create sets slug)
- Modify: `app/api/admin/campaigns/[id]/route.ts` (rename regenerates slug only when DRAFT)

**Interfaces:**
- Consumes: `slugify` from `@/lib/slugify`.
- Produces: `uniqueJoinSlug(name: string, tx: Prisma.TransactionClient | PrismaClient): Promise<string>` — returns a slug of `name` unique across `Campaign.joinToken`, appending `-2`, `-3`, … on collision.

- [ ] **Step 1: Write the uniqueness helper**

Create `lib/join-slug.ts`:
```ts
import { slugify } from "@/lib/slugify";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Returns a join-token slug of `name`, unique across Campaign.joinToken.
// On collision, appends -2, -3, … until free. Falls back to "campaign" for empty slugs.
export async function uniqueJoinSlug(name: string, db: Db): Promise<string> {
  const base = slugify(name) || "campaign";
  let candidate = base;
  let n = 1;
  // Loop until an unused slug is found.
  while (await db.campaign.findUnique({ where: { joinToken: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
```

- [ ] **Step 2: Verify the helper with a throwaway script (no test framework in this repo)**

Create `_verify_join_slug.mjs`:
```js
import { PrismaClient } from "@prisma/client";
import { uniqueJoinSlug } from "./lib/join-slug.ts";

const prisma = new PrismaClient();
// Two campaigns with the same name should get distinct slugs.
const a = await prisma.campaign.create({ data: { name: "Slug Test Co", joinToken: await uniqueJoinSlug("Slug Test Co", prisma) } });
const b = await prisma.campaign.create({ data: { name: "Slug Test Co", joinToken: await uniqueJoinSlug("Slug Test Co", prisma) } });
console.log("A:", a.joinToken, "B:", b.joinToken);
if (a.joinToken === b.joinToken) throw new Error("COLLISION: slugs not unique");
if (a.joinToken !== "slug-test-co") throw new Error(`unexpected first slug: ${a.joinToken}`);
if (b.joinToken !== "slug-test-co-2") throw new Error(`unexpected second slug: ${b.joinToken}`);
await prisma.campaign.deleteMany({ where: { id: { in: [a.id, b.id] } } });
console.log("PASS: unique slugs, cleaned up");
await prisma.$disconnect();
```
Run (PowerShell): `npx tsx _verify_join_slug.mjs`
Expected: `PASS: unique slugs, cleaned up`. **Note:** this step depends on Step 4's create route NOT yet being required (the script provides `joinToken` explicitly), but it DOES require the schema still accepting an explicit `joinToken` — which it always does. Run it after Step 3's schema change is applied so the default is already gone. Then delete the script:
```bash
rm _verify_join_slug.mjs
```

- [ ] **Step 3: Remove the cuid default from `joinToken` and migrate**

In `prisma/schema.prisma`, find:
```
  joinToken                  String         @unique @default(cuid())
```
Replace with:
```
  joinToken                  String         @unique
```
Then generate the migration (PowerShell):
```powershell
npx prisma migrate dev --name joinToken_no_default
```
Expected: a new migration under `prisma/migrations/` that drops the column default; `prisma generate` runs; no data loss (existing `joinToken` values are retained).

- [ ] **Step 4: Set the slug on campaign create**

In `app/api/admin/campaigns/route.ts`, add the import at the top (after the existing imports):
```ts
import { uniqueJoinSlug } from "@/lib/join-slug";
```
Then in `POST`, find:
```ts
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
```
Replace with (compute the slug first, pass it as `joinToken`):
```ts
    const joinToken = await uniqueJoinSlug(name.trim(), prisma);
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        joinToken,
```

- [ ] **Step 5: Regenerate slug on rename only when DRAFT**

In `app/api/admin/campaigns/[id]/route.ts`, add the import:
```ts
import { uniqueJoinSlug } from "@/lib/join-slug";
```
Change the existing-campaign lookup in `PATCH` to also read `status` and `name`. Find:
```ts
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
```
Replace with:
```ts
    const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
```
Then, immediately before the `const campaign = await prisma.campaign.update({` call, insert the slug-regeneration logic:
```ts
    // Regenerate the join slug only when a DRAFT campaign is renamed — never for a
    // live/ended campaign, whose join link may already have been distributed.
    let joinTokenUpdate: { joinToken?: string } = {};
    if (
      name !== undefined &&
      name.trim() !== existing.name &&
      existing.status === "DRAFT"
    ) {
      joinTokenUpdate = { joinToken: await uniqueJoinSlug(name.trim(), prisma) };
    }
```
Then in the `data: { ... }` object of the update, add `...joinTokenUpdate,` as the first spread line (right after the opening `{`).

- [ ] **Step 6: Backfill existing campaigns' join tokens**

Create `_backfill_join_slugs.mjs`:
```js
import { PrismaClient } from "@prisma/client";
import { uniqueJoinSlug } from "./lib/join-slug.ts";

const prisma = new PrismaClient();
const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true, joinToken: true } });
let changed = 0;
for (const c of campaigns) {
  const slug = await uniqueJoinSlug(c.name, prisma);
  if (slug !== c.joinToken) {
    await prisma.campaign.update({ where: { id: c.id }, data: { joinToken: slug } });
    console.log(`${c.name}: ${c.joinToken} -> ${slug}`);
    changed += 1;
  }
}
console.log(`Backfill complete. ${changed} campaign(s) updated.`);
await prisma.$disconnect();
```
Run (PowerShell): `npx tsx _backfill_join_slugs.mjs`
Expected: each existing campaign printed with its new slug (or none if already slug-shaped). Then delete:
```bash
rm _backfill_join_slugs.mjs
```
**Caveat (already flagged in the spec):** this changes existing join tokens, so any previously shared old cuid links stop resolving. Acceptable at this stage.

- [ ] **Step 7: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Create a campaign named "Relationship Manager RBC" → its join link (shown on the campaign page) reads `/join/relationship-manager-rbc`. Create a second campaign with the same name → its link is `/join/relationship-manager-rbc-2`. Open a slug join link → the candidate join/login flow still resolves the campaign.

- [ ] **Step 9: Commit**

```bash
git add lib/join-slug.ts prisma/schema.prisma prisma/migrations app/api/admin/campaigns/route.ts "app/api/admin/campaigns/[id]/route.ts"
git commit -m "$(cat <<'EOF'
feat: readable campaign-name slug for candidate join links

joinToken is now a slug of the campaign name (relationship-manager-rbc)
instead of a 25-char cuid, deduplicated with a numeric suffix on
collision. Set at create; regenerated on rename only while DRAFT so a
live campaign's distributed link never breaks. Existing campaigns
backfilled via a one-off script.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Decouple credential email from CSV import

**Files:**
- Modify: `app/api/admin/campaigns/[id]/candidates/import/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the import response now includes each created candidate's `id` so the UI can offer to email them: `{ imported: number, candidates: { id, name, accessId, email, password }[] }`. The `sendCredentials` import and the auto-send block are removed.

- [ ] **Step 1: Remove the auto-send block and the now-unused imports**

In `app/api/admin/campaigns/[id]/candidates/import/route.ts`:

Change the import line:
```ts
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq, formatExamDate } from "@/lib/campaign-utils";
import { sendCredentials } from "@/lib/email";
```
to (drop `formatExamDate` and the whole email import — both become unused once the send block is gone):
```ts
import { generatePassword, hashPassword, makeAccessId, nextAccessSeq } from "@/lib/campaign-utils";
```

- [ ] **Step 2: Replace create + email with create-and-return-ids**

Find everything from the `await prisma.$transaction` block through the final `return NextResponse.json(...)` (the transaction, the branding/appUrl/loginUrl/examDate setup, the `Promise.allSettled` send, `emailFailures`, and the return):
```ts
  await prisma.$transaction(async (tx) => {
    await tx.candidate.createMany({
      data: credentials.map((c) => ({
        accessId: c.accessId,
        email: c.email,
        name: c.name,
        passwordHash: c.passwordHash,
        generatedPassword: c.password,
        campaignId: id,
      })),
    });
  });

  // Fetch org branding for email template
  const branding = await prisma.orgBranding.findFirst();
  const orgName = branding?.orgName ?? "PreCognise";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL environment variable is not set");
  const loginUrl = `${appUrl}/candidate/login`;
  const examDate = campaign.scheduledAt ? formatExamDate(campaign.scheduledAt) : undefined;

  const emailResults = await Promise.allSettled(
    credentials.map((c) =>
      sendCredentials({
        to: c.email,
        name: c.name,
        accessId: c.accessId,
        password: c.password,
        loginUrl,
        examDate,
        orgName,
      })
    )
  );

  const emailFailures = emailResults
    .map((r, i) => (r.status === "rejected" ? credentials[i].email : null))
    .filter((e): e is string => e !== null);

  return NextResponse.json(
    {
      imported: credentials.length,
      emailFailures,
      credentials: credentials.map((c) => ({ name: c.name, accessId: c.accessId, email: c.email, password: c.password })),
    },
    { status: 201 }
  );
```
Replace with (create inside the transaction, then read the created rows' ids back so the UI can email them; no email sent here):
```ts
  await prisma.$transaction(async (tx) => {
    await tx.candidate.createMany({
      data: credentials.map((c) => ({
        accessId: c.accessId,
        email: c.email,
        name: c.name,
        passwordHash: c.passwordHash,
        generatedPassword: c.password,
        campaignId: id,
      })),
    });
  });

  // Read back the created rows to return their ids (createMany doesn't return records).
  const created = await prisma.candidate.findMany({
    where: { campaignId: id, email: { in: credentials.map((c) => c.email) } },
    select: { id: true, name: true, accessId: true, email: true, generatedPassword: true },
  });

  return NextResponse.json(
    {
      imported: created.length,
      candidates: created.map((c) => ({
        id: c.id,
        name: c.name,
        accessId: c.accessId,
        email: c.email,
        password: c.generatedPassword ?? "",
      })),
    },
    { status: 201 }
  );
```

- [ ] **Step 3: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors (confirms `formatExamDate`/`sendCredentials` are no longer referenced anywhere in this file).

- [ ] **Step 4: Manual verification**

Import a small CSV → confirm candidates are created and NO email is sent (check the Resend dashboard, or simply confirm no network send occurred). The response should carry `candidates` with `id`s (visible in the browser Network tab).

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/campaigns/[id]/candidates/import/route.ts"
git commit -m "$(cat <<'EOF'
refactor: stop auto-emailing on CSV import; return created candidate ids

Import now only creates candidates and returns their ids, decoupling
email from creation so the admin can choose when to send. The unthrottled
Promise.allSettled email block (and its now-unused imports) are removed;
sending moves to a dedicated endpoint.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Email module — join link + throttled batch sender

**Files:**
- Modify: `lib/email.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `SendCredentialsOpts` field `loginUrl` renamed to `joinUrl`.
  - `sendCredentialsBatch(recipients: SendCredentialsOpts[]): Promise<{ sent: string[]; failed: string[] }>` — sends in chunks of 10 with a ~1s gap between chunks; returns recipient emails partitioned by outcome.

- [ ] **Step 1: Rename `loginUrl` → `joinUrl` and update the template button**

In `lib/email.ts`, in `SendCredentialsOpts`, change:
```ts
  loginUrl: string;
```
to:
```ts
  joinUrl: string;
```
In `sendCredentials`, change the destructure:
```ts
  const { to, name, accessId, password, loginUrl, examDate, orgName = "PreCognise" } = opts;
```
to:
```ts
  const { to, name, accessId, password, joinUrl, examDate, orgName = "PreCognise" } = opts;
```
And the button in the template:
```ts
    <a href="${loginUrl}" style="display:inline-block;background:#6366F1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Log In to Exam →</a>
```
to:
```ts
    <a href="${joinUrl}" style="display:inline-block;background:#6366F1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Start Your Assessment →</a>
```

- [ ] **Step 2: Add the throttled batch sender**

In `lib/email.ts`, immediately after the `sendCredentials` function (before `SendOTPOpts`), add:
```ts
// Sends credential emails in small chunks with a short gap between chunks to stay
// within Resend's rate limits. Returns recipient emails partitioned by outcome.
export async function sendCredentialsBatch(
  recipients: SendCredentialsOpts[]
): Promise<{ sent: string[]; failed: string[] }> {
  const CHUNK = 10;
  const GAP_MS = 1000;
  const sent: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK);
    const results = await Promise.allSettled(slice.map((r) => sendCredentials(r)));
    results.forEach((res, j) => {
      if (res.status === "fulfilled") sent.push(slice[j].to);
      else failed.push(slice[j].to);
    });
    if (i + CHUNK < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }
  }

  return { sent, failed };
}
```

- [ ] **Step 3: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors. (No other file references `loginUrl` on `SendCredentialsOpts` now — Task 3 removed the import route's usage.)

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "$(cat <<'EOF'
feat: email carries the join link; add throttled batch sender

Renames SendCredentialsOpts.loginUrl to joinUrl and points the email
button at the campaign join page (the login flow needs the join token).
Adds sendCredentialsBatch, which sends in chunks with a gap between
them to respect Resend rate limits and reports per-recipient outcomes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Send-credentials API endpoint

**Files:**
- Create: `app/api/admin/campaigns/[id]/candidates/send-credentials/route.ts`

**Interfaces:**
- Consumes: `sendCredentialsBatch`, `SendCredentialsOpts` from `@/lib/email`; `formatExamDate` from `@/lib/campaign-utils`; `uniqueJoinSlug` is NOT needed (campaign already has a `joinToken`).
- Produces: `POST` accepting `{ candidateIds: string[] }`, returning `{ sent: number, failed: number, failedEmails: string[] }`. Rejects >200 ids with 422.

- [ ] **Step 1: Write the route**

Create `app/api/admin/campaigns/[id]/candidates/send-credentials/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCredentialsBatch, type SendCredentialsOpts } from "@/lib/email";
import { formatExamDate } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

const MAX_PER_REQUEST = 200;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const candidateIds: string[] = Array.isArray(body.candidateIds) ? body.candidateIds : [];

    if (candidateIds.length === 0) {
      return NextResponse.json({ error: "candidateIds is required" }, { status: 400 });
    }
    if (candidateIds.length > MAX_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many candidates in one send (max ${MAX_PER_REQUEST}). Select fewer and try again.` },
        { status: 422 }
      );
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds }, campaignId: id },
      select: { name: true, email: true, accessId: true, generatedPassword: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL environment variable is not set");
    const joinUrl = `${appUrl}/join/${campaign.joinToken}`;

    const branding = await prisma.orgBranding.findFirst();
    const orgName = branding?.orgName ?? "PreCognise";
    const examDate = campaign.scheduledAt ? formatExamDate(campaign.scheduledAt) : undefined;

    const recipients: SendCredentialsOpts[] = candidates
      .filter((c) => c.generatedPassword)
      .map((c) => ({
        to: c.email,
        name: c.name,
        accessId: c.accessId,
        password: c.generatedPassword as string,
        joinUrl,
        examDate,
        orgName,
      }));

    const { sent, failed } = await sendCredentialsBatch(recipients);

    return NextResponse.json({ sent: sent.length, failed: failed.length, failedEmails: failed });
  } catch (err) {
    console.error("POST /api/admin/campaigns/[id]/candidates/send-credentials failed:", err);
    return NextResponse.json({ error: "Failed to send emails. Please try again." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With a campaign that has candidates (each with a stored password), POST `{ candidateIds: [<one id>] }` to the endpoint (via the browser console `fetch` or the UI once Task 6 lands) → confirm the email arrives, the "Start Your Assessment" button opens `/join/<slug>`, and login with the emailed Access ID + password succeeds end-to-end. Confirm a request with 201 ids returns 422.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/campaigns/[id]/candidates/send-credentials/route.ts"
git commit -m "$(cat <<'EOF'
feat: endpoint to send credential emails to selected candidates

POST /api/admin/campaigns/[id]/candidates/send-credentials takes a
list of candidate ids (capped at 200/request), builds each recipient's
credentials with the campaign join link, and sends via the throttled
batch sender, returning sent/failed counts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Candidate-list UI — selection, email actions, upload prompt

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (CandidatesTab component)

**Interfaces:**
- Consumes: `POST /api/admin/campaigns/[id]/candidates/send-credentials` (Task 5); the import response's `candidates[].id` (Task 3).
- Produces: no new interface — UI only.

This task adds four things to `CandidatesTab`: (a) per-row + select-all checkboxes with selection state, (b) an "Email selected (N)" toolbar action, (c) a per-row "Resend" email button, (d) a "send now / later" prompt after a successful import. It reuses the existing `Candidate` type and table.

- [ ] **Step 1: Add selection + send state and handlers**

In `CandidatesTab`, after the existing `const [removingAll, setRemovingAll] = useState(false);` line, add:
```tsx
  // Email selection + sending
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  // "Send now?" prompt after an import — holds the just-imported candidate ids
  const [pendingEmailIds, setPendingEmailIds] = useState<string[] | null>(null);

  const MAX_EMAIL_PER_SEND = 200;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id)),
    );
  }

  async function sendCredentialEmails(ids: string[]) {
    if (ids.length === 0 || sending) return;
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch(
        `/api/admin/campaigns/${campaignId}/candidates/send-credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds: ids }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setSendMsg(data.error ?? "Failed to send emails.");
        return;
      }
      setSendMsg(
        data.failed > 0
          ? `Sent ${data.sent}. ${data.failed} failed: ${data.failedEmails.join(", ")}`
          : `Sent ${data.sent} email${data.sent !== 1 ? "s" : ""}.`,
      );
      setSelectedIds(new Set());
    } catch {
      setSendMsg("Something went wrong sending emails. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }
```

- [ ] **Step 2: Offer "send now" after a successful import**

In `handleImport`, find:
```tsx
      setImportResult(data);
      setImportRows([]);
      onChanged();
```
Replace with (capture the created ids and open the prompt):
```tsx
      setImportResult(data);
      setImportRows([]);
      const ids: string[] = (data.candidates ?? []).map((c: { id: string }) => c.id);
      setPendingEmailIds(ids.length > 0 ? ids : null);
      onChanged();
```

- [ ] **Step 3: Render the "send now / later" prompt**

Directly above the `{/* ── Candidate table ── */}` section comment, insert:
```tsx
        {pendingEmailIds && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#6366F1]/30 bg-indigo-50 px-4 py-3">
            <p className="text-sm text-[#0F172A]">
              Send login emails to {pendingEmailIds.length} imported candidate
              {pendingEmailIds.length !== 1 ? "s" : ""} now?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={async () => {
                  await sendCredentialEmails(pendingEmailIds);
                  setPendingEmailIds(null);
                }}
                className="rounded-lg bg-[#6366F1] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send now"}
              </button>
              <button
                type="button"
                onClick={() => setPendingEmailIds(null)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-1.5 text-xs font-medium text-[#64748B] hover:bg-white"
              >
                Not yet
              </button>
            </div>
          </div>
        )}
        {sendMsg && (
          <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#334155]">
            {sendMsg}
          </div>
        )}
```

- [ ] **Step 4: Add the "Email selected" toolbar action**

In the candidate-table header's action row, find the "Download credentials" button's opening and insert the email-selected button immediately before it. Find:
```tsx
          <div className="flex items-center gap-2">
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadExcel(
```
Replace with:
```tsx
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                disabled={sending || selectedIds.size > MAX_EMAIL_PER_SEND}
                onClick={() => sendCredentialEmails(Array.from(selectedIds))}
                title={
                  selectedIds.size > MAX_EMAIL_PER_SEND
                    ? `Select at most ${MAX_EMAIL_PER_SEND} at a time`
                    : undefined
                }
                className="flex items-center gap-1.5 rounded-lg bg-[#6366F1] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-50"
              >
                {sending ? "Sending…" : `Email selected (${selectedIds.size})`}
              </button>
            )}
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadExcel(
```

- [ ] **Step 5: Add the select-all header cell**

In the table `<thead>`, find:
```tsx
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  <th className="px-5 py-3 text-left">Access ID</th>
```
Replace with:
```tsx
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  <th className="px-5 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all candidates"
                      checked={candidates.length > 0 && selectedIds.size === candidates.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#6366F1]"
                    />
                  </th>
                  <th className="px-5 py-3 text-left">Access ID</th>
```

- [ ] **Step 6: Add the per-row checkbox and "Resend" button**

In the table `<tbody>` row, find the opening cells:
```tsx
                    <tr
                      className={`border-b border-[#E2E8F0] ${i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}`}
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-[#0F172A]">
                        {c.accessId}
                      </td>
```
Replace with (add the checkbox cell before Access ID):
```tsx
                    <tr
                      className={`border-b border-[#E2E8F0] ${i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}`}
                    >
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#6366F1]"
                        />
                      </td>
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-[#0F172A]">
                        {c.accessId}
                      </td>
```
Then find the actions cell with the remove button:
```tsx
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(c.id)}
                          disabled={removing === c.id}
                          className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"
                          title="Remove candidate"
                        >
```
Replace the opening `<td>` and add a Resend button before the remove button:
```tsx
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => sendCredentialEmails([c.id])}
                          disabled={sending || !c.generatedPassword}
                          className="mr-2 rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
                          title="Email this candidate their login details"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(c.id)}
                          disabled={removing === c.id}
                          className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"
                          title="Remove candidate"
                        >
```

- [ ] **Step 7: Fix the empty-state colspan (a column was added)**

Find the empty-state row (if it uses a `colSpan`), and any other `colSpan` in this table, and increase it by 1. Search this component for `colSpan` — if the "No candidates yet" state is rendered as a full-width `<td>`, update its `colSpan` to account for the new checkbox column. (If the empty state is the separate `candidates.length === 0` block that does NOT use a table, no change is needed there — verify which pattern is present and only adjust real `colSpan` values.)

- [ ] **Step 8: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Manual verification**

On a campaign with candidates: (a) tick a few rows → "Email selected (N)" appears → click → toast shows "Sent N"; (b) tick the header box → all rows select; (c) a single row's "Resend" sends one email; (d) import a CSV → the "Send login emails to N candidates now?" prompt appears → "Send now" emails them, "Not yet" dismisses without sending. Confirm a received email's link opens the campaign join page and login works.

- [ ] **Step 10: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: send/resend credential emails from the candidate list

Adds row + select-all checkboxes, an "Email selected (N)" action, a
per-row Resend button, and a "send now / later" prompt after CSV
import. All call the send-credentials endpoint; selection is capped at
200 per send with the action disabled past the cap.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Instructions page reflects all anti-cheat selections

**Files:**
- Modify: `app/api/candidate/instructions/route.ts`
- Modify: `app/candidate/instructions/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the instructions API's `campaign.antiCheat` object gains `screenshot`, `devTools`, `duplicateLogin` booleans.

- [ ] **Step 1: Return the extra anti-cheat fields from the API**

In `app/api/candidate/instructions/route.ts`, in the `select` under `campaign`, find:
```ts
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            _count: { select: { questions: true } },
```
Replace with:
```ts
            antiCheatTabSwitch: true,
            tabSwitchLimit: true,
            antiCheatFullscreen: true,
            antiCheatCopyPaste: true,
            antiCheatRightClick: true,
            antiCheatScreenshot: true,
            antiCheatDevTools: true,
            disqualifyOnDuplicateLogin: true,
            _count: { select: { questions: true } },
```
Then in the response's `antiCheat` object, find:
```ts
        antiCheat: {
          tabSwitch: candidate.campaign.antiCheatTabSwitch,
          tabSwitchLimit: candidate.campaign.tabSwitchLimit,
          fullscreen: candidate.campaign.antiCheatFullscreen,
          copyPaste: candidate.campaign.antiCheatCopyPaste,
          rightClick: candidate.campaign.antiCheatRightClick,
        },
```
Replace with:
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

- [ ] **Step 2: Extend the page's `AntiCheat` interface**

In `app/candidate/instructions/page.tsx`, find:
```tsx
interface AntiCheat {
  tabSwitch: boolean;
  tabSwitchLimit: number;
  fullscreen: boolean;
  copyPaste: boolean;
  rightClick: boolean;
}
```
Replace with:
```tsx
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

- [ ] **Step 3: Render the three new rules**

Find the rules-building block:
```tsx
  if (ac.fullscreen) rules.push("You must stay in fullscreen mode for the entire exam.");
  if (ac.copyPaste) rules.push("Copying and pasting text is disabled.");
  if (ac.rightClick) rules.push("Right-clicking is disabled during the exam.");
  rules.push("Refreshing or closing the browser tab will disqualify you immediately.");
  rules.push("Each question has a timer — unanswered questions are skipped automatically.");
```
Replace with:
```tsx
  if (ac.fullscreen) rules.push("You must stay in fullscreen mode for the entire exam.");
  if (ac.copyPaste) rules.push("Copying and pasting text is disabled.");
  if (ac.rightClick) rules.push("Right-clicking is disabled during the exam.");
  if (ac.screenshot) rules.push("Screenshot attempts are blocked and recorded.");
  if (ac.devTools) rules.push("Browser developer tools are blocked during the exam.");
  if (ac.duplicateLogin) rules.push("Logging in from a second device will disqualify you.");
  rules.push("Refreshing or closing the browser tab will disqualify you immediately.");
  rules.push("Each question has a timer — unanswered questions are skipped automatically.");
```

- [ ] **Step 4: Type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In a campaign's Settings tab, enable Screenshot-block, DevTools-block, and Block-duplicate-logins (and toggle others). Deploy the campaign, log in as a candidate, and confirm the instructions page shows exactly one rule line per enabled feature and nothing for disabled ones (e.g. turn Right-click off → its line disappears).

- [ ] **Step 6: Commit**

```bash
git add app/api/candidate/instructions/route.ts app/candidate/instructions/page.tsx
git commit -m "$(cat <<'EOF'
feat: instructions page reflects all anti-cheat selections

The instructions API now returns screenshot, devtools, and
duplicate-login settings, and the candidate instructions page renders
one plain-language rule per enabled feature instead of a partial
hardcoded set. Shuffle settings stay off the list (fairness, not a
candidate rule).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run (PowerShell): `npx tsc --noEmit -p .`
Expected: zero errors.

- [ ] **Step 2: Confirm no leftover references to the renamed email field or removed import behavior**

```bash
grep -rn "loginUrl" --include="*.ts" --include="*.tsx" lib app
```
Expected: no matches in `lib/email.ts` or the send/import routes (the field is `joinUrl` now). Any unrelated `loginUrl` elsewhere is fine — confirm it's not on `SendCredentialsOpts`.

- [ ] **Step 3: End-to-end manual walkthrough**

1. Create a campaign "QA Email Test" with Candidate limit 20 → join link is `/join/qa-email-test`.
2. Import a 3-row CSV → no email auto-sent; the "send now?" prompt appears; Access IDs read `QA-01`, `QA-02`, `QA-03` (2-digit pad for a 20 limit; prefix is first 4 alnum of the name → "QAEM"? — confirm actual prefix and that padding width matches the limit's digit count).
3. Click "Send now" → 3 emails; open one → button opens `/join/qa-email-test`; log in with the emailed Access ID + password → reaches the instructions page.
4. On the instructions page, confirm the anti-cheat rules match exactly the campaign's enabled settings.
5. Back in the candidate list, select all → "Email selected (3)" → resend works; single-row "Resend" works.

- [ ] **Step 4: No commit** — verification only; fix any issue in the task that introduced it and re-commit there.
