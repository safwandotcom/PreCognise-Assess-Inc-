# Open-Join Campaign Window — Design Spec

## Problem

Today every candidate must be pre-added by an admin (CSV import or manual
entry) with a system-generated `accessId` + password before they can log in.
Some campaigns don't want that overhead: the admin wants to open a single
join link to anyone, during a scheduled window, and have candidates identify
themselves on the way in rather than being pre-registered.

## Goals

- Per-campaign opt-in: existing invite-only campaigns are completely
  unaffected.
- No pre-added candidates required for an open-join campaign.
- Candidates identify themselves with name + email (no password) at join
  time.
- The campaign accepts joins, and runs, only within an admin-set window.
  Entry closes at the window's end, and any exam still in progress is force-
  ended at that same instant — nobody's exam outlives the window, regardless
  of when they started.
- The admin distributes the join link themselves (e.g. by email); the system
  does not send it automatically.

## Non-goals

- Automated emailing of the join link.
- Fully anonymous entry (no name/email at all) — explicitly rejected in
  favor of name+email, so results stay attributable and duplicate/rejoin
  handling stays possible.
- Fixing `REMAINING_TASKS.txt` #28 (the separate `/candidate/waiting-room`
  countdown bug, a different screen from the one this feature touches).
- Any change to how `durationSec` is computed or used elsewhere (it remains
  the sum of question `timeLimitSec`, used for the instructions page's
  "N minutes total" display and the pre-existing cron auto-end at
  `startedAt + durationSec` — untouched by this feature).

## Data model

One new column:

```prisma
model Campaign {
  // ...existing fields...
  openJoinEnabled Boolean @default(false)
}
```

No other schema changes. The window itself is expressed with fields that
already exist and are already wired into `/join/[token]`'s gating logic:

- `scheduledAt` — window opens.
- `gracePeriodMin` — minutes after `scheduledAt` during which entry stays
  open. Window closes at `scheduledAt + gracePeriodMin`.

For an open-join campaign, the admin-facing labels for these two fields
change (see Admin UI below) but the underlying fields, types, and API
contract are identical to today's invite-only campaign.

`durationSec` is explicitly **not** used for window timing — it's owned by
the question editor (auto-recomputed from `Σ timeLimitSec` on every
question create/update) and is unrelated to campaign scheduling.

## Join & registration flow

### `/join/[token]` (`JoinGate.tsx`) — unchanged gating, new destination

No changes to the DRAFT / SCHEDULED / LIVE / ENDED states or the
grace-period math in `JoinGate.tsx` — it already implements exactly the
open/close window behavior this feature needs, for both modes.

The only change: `JoinPage` (`app/join/[token]/page.tsx`) additionally
selects `openJoinEnabled` from the campaign and passes it to `JoinGate`.
`JoinGate`'s "Join Now" button routes to:

- `` /candidate/login?token=${token} `` — invite-only (unchanged)
- `` /candidate/login?token=${token}&mode=open `` — open-join

### `/candidate/login` — conditional form

`LoginForm` reads the `mode` search param (already reads `token`the same
way). When `mode === "open"`, it renders a name + email form instead of the
existing accessId + password form, and POSTs to the same
`/api/auth/login` endpoint with a different body shape:

```ts
// invite-only (unchanged)
{ accessId, password, joinToken }

// open-join
{ mode: "open", name, email, joinToken }
```

Both branches receive `{ token, candidateName }` on success and proceed
identically from there (`setToken`, store `candidateName`, redirect to
`/candidate/waiting-room`).

### `POST /api/auth/login` — open-join branch

When `body.mode === "open"`:

1. Reject if `!name?.trim() || !email?.trim()`.
2. Resolve the campaign by `joinToken` (same as today).
3. Reject if `campaign.openJoinEnabled` is not `true` (defense in depth —
   the UI shouldn't reach here otherwise).
4. Reject if the campaign is not currently within its window:
   `campaign.status` must be `LIVE` or `PAUSED`, **and**
   `now <= campaign.scheduledAt + campaign.gracePeriodMin` (minutes). This
   is the same condition `JoinGate` already renders client-side as "Entry
   period has closed" — the API enforces it too, so a direct POST after the
   window can't bypass the UI. (This same check does not currently exist
   for the invite-only branch either — a pre-existing gap. Not fixed here;
   flagged as a candidate for a future pass since it's outside this
   feature's scope.)
5. Look up `Candidate` by `{ email: email.trim().toLowerCase(), campaignId }`.
   - **Found:** treat as a returning candidate. Skip to the existing
     atomic-claim step (5 below) using this candidate — this is what lets
     someone whose tab closed rejoin with the same email, and it's what
     makes `disqualifyOnDuplicateLogin` apply the same way it does today.
   - **Not found:** create one:
     ```ts
     const plainPassword = generatePassword();       // lib/campaign-utils
     const accessId = makeAccessId(campaign.name, nextAccessSeq(existing), campaign.maxCandidates);
     await prisma.candidate.create({
       data: {
         accessId,
         email: email.trim().toLowerCase(),
         name: name.trim(),
         passwordHash: await hashPassword(plainPassword),
         generatedPassword: plainPassword,
         campaignId: campaign.id,
         status: CandidateStatus.REGISTERED,
       },
     });
     ```
     `accessId`/`generatedPassword` are stored for internal consistency
     (schema requires `passwordHash` non-null, and the admin's existing
     candidate list/export UI expects these fields to be populated) but are
     never shown to or used by the candidate — the open-join flow never
     asks for a password.
6. From here, reuse the existing atomic single-session claim
   (`updateMany({ where: { id, activeToken: null }, data: { activeToken: "pending", status: JOINED } })`)
   and `disqualifyOnDuplicateLogin` handling verbatim — no changes to that
   logic.

Everything after login (waiting room, instructions, exam, scoring,
anti-cheat, results, analytics) is unchanged: it's still a `Candidate` row
like any other.

## Hard cutoff for in-progress exams

Today, nothing stops `submit-answer` or `next-question` from succeeding
after a campaign's window has closed — only the login route (and now, per
above, only weakly) gates entry. This is the concrete fix for "runs only
during those hours strictly":

In `app/api/assessment/submit-answer/route.ts` and
`app/api/assessment/next-question/route.ts`, after resolving the
candidate's campaign, reject with a clear "time's up" error (`403`) when:

```ts
campaign.scheduledAt &&
now.getTime() > campaign.scheduledAt.getTime() + campaign.gracePeriodMin * 60_000
```

This check is **not** gated on `openJoinEnabled` — it applies to any
campaign with a `scheduledAt` set, open-join or invite-only alike, since the
underlying gap (nothing enforces the window server-side once a candidate is
past login) is identical in both modes and this is the correctness fix for
it. Invite-only campaigns keep their current default `gracePeriodMin` of 10
minutes, so this only changes behavior for campaigns that were already
supposed to have closed 10+ minutes ago — not a behavior change for anyone
inside a normal exam window today.

The candidate-facing exam page (`app/candidate/exam/page.tsx`) shows the
resulting error as a dedicated "time's up" state rather than the generic
error toast, redirecting to `/candidate/result` (or a new minimal
"assessment window closed" screen if `/candidate/result` assumes a
completed, scored attempt — implementation plan decides based on what state
`/candidate/result` needs).

## Admin UI

`app/admin/campaigns/[id]/page.tsx` (the campaign edit/settings view):

- New toggle: **"Open join (no pre-added candidates)"**, bound to
  `openJoinEnabled`, saved via the existing `PATCH /api/admin/campaigns/[id]`
  endpoint (add `openJoinEnabled` to its accepted body fields, same pattern
  as `gracePeriodMin`).
- When enabled:
  - The `scheduledAt` field is labeled **"Window opens at"**.
  - The `gracePeriodMin` field is labeled **"Window duration (minutes)"**
    instead of "Grace period" — same field, same input, different label and
    helper text ("Candidates can join any time in this window; the
    assessment ends for everyone the instant it closes").
  - The Candidates tab's CSV-import and manual-add UI is hidden — nothing to
    pre-populate.
  - The join link (already shown today, `/join/{token}`) gets a "Copy join
    link" button if it doesn't already have one, with a short note that the
    admin should send it themselves (email, chat, etc.) — no in-app sending
    is added.
- When disabled (default): everything behaves exactly as it does today.

`app/admin/campaigns/new/page.tsx`: same `openJoinEnabled` toggle available
at creation time, defaulting off.

## Results & reporting

No changes. Self-registered candidates are ordinary `Candidate` rows and
appear in the existing candidates list, results page, and analytics exactly
like manually-added ones — including the existing `OPTION_LETTERS`-adjacent
option-frequency charts, negative marking, and CSV/PDF export.

## Edge cases

- **Email already used, candidate mid-exam, second tab opens with same
  email:** identical to today's invite-only duplicate-login handling —
  `disqualifyOnDuplicateLogin` decides whether this disqualifies both
  sessions or soft-blocks the second one.
- **Candidate joins with an email that was previously disqualified in this
  campaign:** the existing `DISQUALIFIED` check in `/api/auth/login`
  (`if (candidate.status === DISQUALIFIED) return 403`) applies unchanged —
  they cannot re-enter.
- **Window closes while the admin is mid-edit of `gracePeriodMin`:** no
  special handling; it's a live value read at check time, same as today.
- **`maxCandidates` on an open-join campaign:** `makeAccessId` already
  accepts `maxCandidates` for its ID-padding scheme; if the campaign has a
  cap, `nextAccessSeq` naturally exceeding it is out of scope for this
  feature (existing behavior for the invite-only path is unspecified here
  too — not introduced or worsened by this change).

## Open items for the implementation plan

- Exact shape of the "time's up" screen the exam page redirects to.
- Whether `/api/admin/campaigns/[id]/route.ts`'s field list needs
  `openJoinEnabled` added to the campaign creation endpoint
  (`app/api/admin/campaigns/route.ts`) as well as the update endpoint —
  yes, both need it; the plan should treat this as two small, mechanical
  edits.
