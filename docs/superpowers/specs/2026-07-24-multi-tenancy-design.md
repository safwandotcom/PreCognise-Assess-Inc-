---
title: Multi-tenancy — per-admin isolated PreCognise Assess accounts
date: 2026-07-24
status: approved (pending spec review)
---

# Multi-tenancy — per-admin isolated accounts

## Goal

Turn the single-tenant admin portal into a multi-tenant one: each Clerk admin user gets their own isolated PreCognise Assess account — their own campaigns, candidates, questions, results, **and** their own branding and global settings — invisible to every other admin. This is the foundation for the coming subscription model (one Clerk user = one account = one future subscription). Adding an admin's email in Clerk is the only onboarding step; on first login they get a blank account and build their own campaigns.

## Background (verified current state)

The system is **single-tenant**. Confirmed by a full inventory:
- **No `ownerId` anywhere.** `Campaign`, `OrgBranding`, `AssessmentSettings` are all global. `Candidate`/`Question`/`Response` hang off a campaign (`campaignId`), so they are only ever owned *through* a campaign.
- **No admin API route checks who is logged in.** Every route under `app/api/admin/**` relies solely on `middleware.ts` `auth.protect()` (which authenticates but does not scope) and then queries globally. `/[id]` routes fetch by id with **no owner check** — any admin can reach another's campaign by id.
- **`admin/stats`** counts candidates across all tenants. **`OrgBranding`/`AssessmentSettings`** are global singletons (`findFirst`). **`send-credentials`** injects the global branding into candidate emails. **`admin/disqualify`** updates a candidate by id with no scope at all.
- **Clerk**: `@clerk/nextjs ^7.5.3`. `middleware.ts` runs `clerkMiddleware`. No route currently imports `auth`. The correct server API is `import { auth } from "@clerk/nextjs/server"; const { userId } = await auth();` (async).
- **Candidate-facing branding/settings** currently resolve to the global singletons: `lib/use-branding.ts` → `/api/branding` (`app/api/branding/route.ts`), and `lib/get-settings.ts` `getSettings()` (used by `assessment/submit-answer`, `assessment/next-question`, public `/api/settings`).
- **Seed** (`prisma/seed.ts`) upserts one ownerless `OrgBranding` and one `AssessmentSettings`.
- **Migration note:** the Neon DB has pre-existing `_prisma_migrations` drift (history rows that don't match the local `prisma/migrations/` folder). This blocks `prisma migrate dev`.

## Design

### Owner key
The owner is the **Clerk user id** (`userId`, a string like `user_...`). Stored as `ownerId` on the tenant-scoped models.

### Schema changes (`prisma/schema.prisma`)
- `Campaign`: add `ownerId String?` + `@@index([ownerId])`.
- `OrgBranding`: add `ownerId String?` (one branding record per owner).
- `AssessmentSettings`: add `ownerId String?` (one settings record per owner).

`ownerId` is **nullable at the database level** (so the columns can be added to existing rows, and an orphaned/NULL row is simply invisible to everyone), but is **treated as required by the application**: every create stamps it, every read filters by it. Branding/settings are looked up per owner with `findFirst({ where: { ownerId } })` (not `findUnique`, to avoid nullable-unique friction) via a get-or-create helper.

### Applying the schema (migration approach)
Use **`npx prisma db push`** to add the three `ownerId` columns (+ the Campaign index). `db push` diffs `schema.prisma` against the actual database structure and applies only the additive column changes — it sidesteps the `_prisma_migrations` history drift entirely (the drift is in the history table, not the real columns). Before applying, review the planned changes it prints; abort if it proposes to drop or alter anything beyond adding the new nullable columns. (Adding *nullable* columns is safe on tables with existing rows.) No new migration file is created; this is acceptable for the current early stage and is called out as a conscious choice.

### Auth + ownership helpers (`lib/tenant.ts`, new)
- `getOwnerId(): Promise<string | null>` — `const { userId } = await auth(); return userId ?? null;`. Admin routes call it first: `const ownerId = await getOwnerId(); if (!ownerId) return 401`.
- `ownedCampaign(id, ownerId)` — `prisma.campaign.findFirst({ where: { id, ownerId } })`; returns the campaign only if it belongs to the caller, else `null` → route returns **404** (not 403, to avoid confirming existence). This single query both fetches and verifies ownership; it replaces every `findUnique({ where: { id } })` in admin `/[id]` routes.

### Every admin route (`app/api/admin/**`)
Each route: resolve `ownerId` up front (401 if none), then:
- **List/aggregate** (`campaigns` GET, `stats`): filter by `{ ownerId }` (stats counts only candidates whose campaign's `ownerId` is the caller).
- **Create** (`campaigns` POST): stamp `ownerId` on the new campaign.
- **`/[id]` campaign routes** (detail GET/PATCH/DELETE, start/pause/end, broadcast, candidates GET/POST + import + send-credentials, questions GET/POST, results, analytics): resolve the campaign via `ownedCampaign(id, ownerId)`; 404 if not owned; then proceed. Nested writes (add/remove candidate, add/reorder/delete question) verify the parent campaign is owned first.
- **Candidate-by-id** (`candidates/[candidateId]` DELETE) and **question-by-id** (`questions/[id]` PATCH/DELETE, `questions/reorder`) and **`disqualify`**: resolve the row → its `campaignId` → verify that campaign's `ownerId` == caller; 404 otherwise.
- **`branding`** GET/PUT and **`settings`** GET/PUT: read/write the caller's own record via the per-owner get-or-create helper.

### Per-owner branding & settings helpers
- `lib/branding.ts` (new): `getBrandingForOwner(ownerId)` → `findFirst({ where: { ownerId } })`, creating a default (current `OrgBranding` defaults) if absent. Used by admin `branding` route and candidate branding resolution.
- `lib/get-settings.ts` (modify): `getSettings(ownerId: string)` → `findFirst({ where: { ownerId } })`, creating a default if absent. All callers pass an `ownerId`.

### Candidate-facing branding & settings resolution
Candidates must see the branding/rules of **the campaign's owner**, resolved from `campaign.ownerId`:
- **`/api/branding`** (`app/api/branding/route.ts`): resolve the owner from either (a) `?token=<joinToken>` → campaign → `ownerId` (pre-login: login, forgot-password pages), or (b) a candidate **Bearer JWT** in the `Authorization` header → `campaignId` → campaign → `ownerId` (post-login: waiting-room, instructions, exam). Then return `getBrandingForOwner(ownerId)` merged with the per-campaign `logoUrl`/`bgColor`. If neither context is present, return the existing neutral default.
- **`lib/use-branding.ts`** (modify): send the candidate JWT (from the auth store) as a Bearer header when no `token` is provided, so post-login pages resolve the right owner. `waiting-room` and `instructions` keep calling `useBranding()` but now get owner-correct branding.
- **Settings in the assessment flow**: `assessment/submit-answer` and `assessment/next-question` already load the candidate's campaign — pass `campaign.ownerId` to `getSettings(ownerId)`. Public **`/api/settings`** resolves the owner the same way `/api/branding` does (joinToken or candidate JWT) and returns that owner's settings.

### Backfill existing data (one-off, deleted after)
A throwaway script (`_backfill_owner.mjs`, PowerShell-run, then deleted):
1. Look up the owner's Clerk user id by email `towfiq@veita.ai` via `clerkClient().users.getUserList({ emailAddress: [...] })`.
2. `campaign.updateMany({ where: { ownerId: null }, data: { ownerId } })`.
3. Assign the existing global `OrgBranding` and `AssessmentSettings` singletons' `ownerId` to that user (so the current branding/settings become yours); if none exist, the get-or-create helpers will make defaults on first use.
4. Print counts of what was updated.
If the Clerk lookup returns no user (the email hasn't logged in / isn't in Clerk yet), the script aborts with a clear message and no changes — the operator adds the user in Clerk first, then re-runs.

### Seed (`prisma/seed.ts`)
Remove the ownerless `OrgBranding`/`AssessmentSettings` upserts (branding/settings are now created per-owner on demand). Leave the rest of the seed as-is.

## Security review (required, built into execution)
After implementation, a dedicated **data-isolation review** pass:
- Enumerates every Prisma query in `app/api/admin/**` and confirms each is either scoped by `{ ownerId }` or gated behind an `ownedCampaign`/ownership check.
- Confirms every `/[id]`, candidate-by-id, and question-by-id route returns 404 for a campaign the caller doesn't own (cross-tenant-by-id is the highest-risk leak).
- Confirms candidate branding/settings resolve strictly from `campaign.ownerId`, never the global-first record.
- Confirms `stats` and any aggregate counts are owner-filtered.
- Confirms `send-credentials` uses the campaign owner's branding, not `findFirst`.
This review must come back clean (no un-scoped query) before the branch is considered done.

## Out of scope
- Billing/subscription enforcement itself (this only builds the per-account isolation it will sit on).
- A "team"/multi-user-per-account model (one Clerk user = one account for now; no inviting sub-users into an account).
- Migrating the candidate JWT to carry `ownerId` (owner is always reachable via `campaignId` → campaign).
- Reconciling the `_prisma_migrations` history drift beyond what `db push` needs (a separate cleanup task).
- Cross-account admin/superadmin views.

## Verification plan
- `npx tsc --noEmit -p .` after each change; a production `next build` before deploy.
- Manual, two-account test in the dev app: add a second admin email in Clerk, log in as each in separate browsers, and confirm:
  - Each sees only their own campaigns list, stats, branding, and settings.
  - Admin A cannot open Admin B's campaign by pasting its `/admin/campaigns/<id>` URL (404), nor its results/candidates/API routes.
  - A candidate joining Admin A's campaign sees Admin A's branding on login/instructions/exam; a candidate in Admin B's campaign sees Admin B's.
  - Creating a campaign as A stamps A as owner; B never sees it.
- The security-review pass returns clean.
