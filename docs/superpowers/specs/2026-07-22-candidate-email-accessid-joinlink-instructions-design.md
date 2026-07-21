---
title: Candidate credential emailing, simpler Access IDs & join links, anti-cheat-driven instructions
date: 2026-07-22
status: approved (pending spec review)
---

# Candidate credential emailing, simpler Access IDs & join links, anti-cheat-driven instructions

## Goal

Five connected improvements to the candidate onboarding flow of this assessment platform (Next.js/TypeScript, Prisma/Postgres, Resend email, Clerk admin auth):

1. **Send/resend credential emails from the candidate list** — individually, for a selected set, or all — instead of only auto-firing on CSV import with no way to resend.
2. **Ask at upload** whether to send login emails now or later.
3. **Simpler Access IDs** — padding width driven by the campaign's Candidate limit, no fixed six-zero padding.
4. **Simpler join links** — a readable campaign-name slug instead of a 25-character random cuid.
5. **Instructions page reflects the admin's actual anti-cheat selections** — one plain-language rule per enabled feature, instead of a partial hardcoded list.

## Background (verified current state)

- **Import route** `app/api/admin/campaigns/[id]/candidates/import/route.ts` already sends credential emails automatically via `Promise.allSettled` over `sendCredentials`, building `loginUrl = ${NEXT_PUBLIC_APP_URL}/candidate/login` — **with no campaign/join token**. That link is effectively broken for login, because login **requires** a join token to resolve the campaign (`app/api/auth/login/route.ts:16-22`).
- **Manual-add route** `app/api/admin/campaigns/[id]/candidates/route.ts` sends no email at all.
- **No send/resend UI** exists in the Candidates tab (`app/admin/campaigns/[id]/page.tsx`), and the candidate table has **no row-selection** mechanism.
- **`sendCredentials`** (`lib/email.ts:15-55`) takes `{ to, name, accessId, password, loginUrl, examDate?, orgName? }`; the template shows Access ID + password + a single button linking to `loginUrl`.
- **Instructions page** (`app/candidate/instructions/page.tsx`) fetches `/api/candidate/instructions`, whose route returns only 5 anti-cheat fields (`antiCheatTabSwitch, tabSwitchLimit, antiCheatFullscreen, antiCheatCopyPaste, antiCheatRightClick`) plus `name, durationSec, instructionsHtml, _count.questions`. Screenshot, DevTools, duplicate-login, and shuffle settings are **not** returned, and the page hardcodes a couple of rules.
- **Access ID** (`lib/campaign-utils.ts:17-24`): `makeAccessId(campaignName, seq)` → 4-letter uppercased prefix (padded with `X`) + `-` + `String(seq).padStart(6, '0')`. `nextAccessSeq` reads the trailing number via `/-(\d+)$/`. Uniqueness is per-campaign (`@@unique([accessId, campaignId])`).
- **Join link**: `joinToken String @unique @default(cuid())` (`prisma/schema.prisma:67`). Admin copies `${origin}/join/${joinToken}`. Join page (`app/join/[token]/page.tsx`) resolves `campaign.findUnique({ where: { joinToken } })`. Login page reads `?token=` and passes it as `joinToken`.
- **`slugify`** already exists (`lib/slugify.ts`), re-exported from `campaign-utils`.

## Part 1 — Access ID format (padding by Candidate limit)

`makeAccessId` gains a third argument, the campaign's `maxCandidates` (nullable):

```
makeAccessId(campaignName: string, seq: number, maxCandidates: number | null): string
  prefix = first 4 alphanumerics of name, uppercased, right-padded with 'X' to length 4  (unchanged)
  width  = maxCandidates ? String(maxCandidates).length : 0
  suffix = String(seq).padStart(width, '0')   // width 0 → no padding
  return `${prefix}-${suffix}`
```

- Max 500 → `RELA-001`, `RELA-047`, `RELA-500`.
- No limit → `RELA-1`, `RELA-2`.
- `nextAccessSeq` is unchanged — `/-(\d+)$/` reads the number regardless of padding.
- **Both** call sites pass `campaign.maxCandidates`: `app/api/admin/campaigns/[id]/candidates/route.ts` (manual add) and `.../candidates/import/route.ts` (bulk).
- **Sort fix**: the candidate list currently relies on zero-padded string sort (`orderBy: { accessId: "asc" }`). With variable/no padding, string sort mis-orders (`RELA-10` before `RELA-2`). Change candidate ordering to **numeric by trailing sequence** — done in the API `GET` handlers that list candidates by sorting on the parsed suffix (or `orderBy` on a stable field then sort in JS by `nextAccessSeq`-style parse). Applies to `.../candidates/route.ts` GET and any other candidate-list read used by the admin table.
- **Existing candidates keep their current `RELA-000001` IDs** — this only affects newly generated IDs. Login compares the stored value verbatim (uppercased), so mixed formats within one campaign coexist safely. Login-page placeholder/helper text updates to a format-agnostic hint (e.g. placeholder `RELA-001`, helper "Your Access ID was emailed to you — e.g. RELA-001").

## Part 2 — Join link as campaign-name slug

- `joinToken`'s `@default(cuid())` is removed; the value is now set explicitly to `slugify(campaign.name)` at creation, with collision handling: if the slug is taken, append `-2`, `-3`, … until unique. A small helper `uniqueJoinSlug(name, tx)` encapsulates the check-and-suffix loop.
- Campaign **create** (`app/api/admin/campaigns/route.ts`) and **rename** (PATCH, when `name` changes) generate/regenerate the slug. Rename regeneration is optional and **off by default** — renaming a live campaign must NOT silently break already-distributed links; regenerate only on create, and on rename only if the campaign is still `DRAFT`. (Stated explicitly so the implementer doesn't invalidate live links.)
- **Migration**: backfill every existing campaign's `joinToken` with a unique slug of its name. **Caveat, flagged for the human:** this changes existing tokens, so any already-shared old cuid links stop resolving. Acceptable at current stage (dev DB, few/no live campaigns); called out here so it's a conscious choice, not a surprise.
- Join page, login page, and login API are unchanged in logic — they resolve by exact `joinToken` match, which a unique slug satisfies. Slugs are lowercase; that's fine (they're the join token, not the Access ID).
- Admin's displayed join link (`app/admin/campaigns/[id]/page.tsx`) automatically shows the prettier value; no code change beyond what already reads `campaign.joinToken`.

## Part 3 — Credential email carries the join link + throttled sending

- `SendCredentialsOpts.loginUrl` is renamed to **`joinUrl`** (semantic accuracy; update the interface, the template's button `href`, and all call sites). Button label becomes **"Start Your Assessment →"**. The body keeps Access ID + password and now links to the real join page: `${NEXT_PUBLIC_APP_URL}/join/${campaign.joinToken}`.
- A new **throttled batch helper** `sendCredentialsBatch(recipients: SendCredentialsOpts[])` sends in small chunks with a short delay between chunks to respect Resend rate limits, returning `{ sent: string[], failed: string[] }` (by email). The **new send route (Part 4)** uses it. The import route no longer sends email at all (Part 4 removes its auto-send block), so it no longer calls any sender.
- Chunk size and delay are small constants (e.g. 10 per chunk, ~1s between) — conservative, tunable, documented inline. This is a pragmatic guard, **not** a full queue; true 20k-in-one-request needs a background job (out of scope — see Part 4 scale note).

## Part 4 — Send/resend from the candidate list

**New endpoint** `POST /api/admin/campaigns/[id]/candidates/send-credentials`:
- Body: `{ candidateIds: string[] }` — always an explicit list of candidate IDs. (No `{ all: true }` mode; "select all" in the UI simply checks every loaded row and sends those IDs, keeping the endpoint's contract single and unambiguous.)
- Resolves candidates (validating each belongs to this campaign), builds each recipient's `SendCredentialsOpts` (join URL from campaign, `generatedPassword` from the stored field, org name from `OrgBranding`, exam date from `campaign.scheduledAt`), and calls `sendCredentialsBatch`.
- Returns `{ sent: number, failed: number, failedEmails: string[] }`.
- **Scale cap**: the route rejects a request whose `candidateIds` exceeds a fixed cap (e.g. 200) with a clear error telling the admin to select fewer, and the UI disables "Email selected" past the cap with the same hint. This is the interim guard against Vercel function timeouts on a huge send; a real background queue for 20k is explicitly out of scope and noted for later.

**Candidates tab UI** (`app/admin/campaigns/[id]/page.tsx`, CandidatesTab):
- Row checkbox per candidate + a "select all" checkbox in the table header (selection state in component state; "select all" selects the currently loaded rows).
- A toolbar above the table shows **"Email selected (N)"** when ≥1 is selected, calling the endpoint with the selected IDs.
- Each row gets an **"Email"** button (label **"Resend"** — kept generic since we don't track sent-state yet) that emails just that candidate.
- Results surface as a toast/inline message using the endpoint's counts; failures list the affected emails.
- **Upload dialog**: after CSV parse + successful create, show a confirm-style prompt "Send login emails to these N candidates now?" with "Send now" / "Not yet." "Send now" calls the send endpoint for the just-imported IDs. This **decouples** emailing from creation — the import API no longer auto-sends (its `Promise.allSettled` block is removed; creation returns the created candidates so the UI can offer the send). Manual single-add likewise creates without emailing; the admin uses the row "Email" button.

## Part 5 — Instructions page per anti-cheat selection

- Extend `GET /api/candidate/instructions` to also select and return: `antiCheatScreenshot`, `antiCheatDevTools`, `disqualifyOnDuplicateLogin`. (Shuffle settings are deliberately **not** surfaced — they're fairness measures, not behavioral rules for the candidate.)
- Extend the page's `AntiCheat` interface to match, and render one plain-language rule **per enabled feature**:

| Setting (when ON) | Candidate-facing rule |
|---|---|
| `antiCheatTabSwitch` (+ `tabSwitchLimit`) | "Stay on the exam tab. Leaving it more than {limit} time(s) will end your exam." (limit 0 → "Leaving the exam tab even once will end your exam.") |
| `antiCheatFullscreen` | "The exam runs in fullscreen. Exiting fullscreen is flagged." |
| `antiCheatCopyPaste` | "Copying and pasting is turned off during the exam." |
| `antiCheatRightClick` | "Right-click is turned off during the exam." |
| `antiCheatScreenshot` | "Screenshot attempts are blocked and recorded." |
| `antiCheatDevTools` | "Browser developer tools are blocked." |
| `disqualifyOnDuplicateLogin` | "Logging in from a second device will disqualify you." |

- The two currently-hardcoded rules (refresh/close disqualifies; per-question timer) remain, as they reflect always-on behavior.
- Admin's custom `instructionsHtml` still renders above the auto-generated rules, unchanged.

## Out of scope

- Background job/queue for very large email sends (20k in one action) — the per-request cap + "click again" is the interim measure.
- Tracking per-candidate "email sent" state / timestamps (so the button says "Resend" generically, not conditionally).
- Changing existing candidates' already-issued Access IDs.
- Invite-only campaign mode and admin audit log (separate `REMAINING_TASKS.txt` items).

## Verification plan

- `npx tsc --noEmit -p .` after each change (repo has no test framework).
- Manual: create a campaign with a name → confirm join link is a readable slug; create a second campaign with the same name → confirm slug gets a `-2` suffix.
- Add candidates with a Candidate limit of 500 → confirm IDs are `RELA-001`…; with no limit → `RELA-1`…; confirm the admin table lists them in correct numeric order past 9/10.
- Import a CSV → confirm the "send now / later" prompt appears and no email fires until chosen; use row "Email", "Email selected", and select-all → confirm counts and that the email link opens the campaign's join page and login succeeds end-to-end.
- Toggle each anti-cheat feature on/off in campaign settings → confirm the instructions page shows exactly the matching rule lines and nothing for disabled features.
