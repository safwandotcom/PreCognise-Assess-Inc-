# Open-Join Campaign Window — Design Spec

## Problem

Today every candidate must be pre-added by an admin (CSV import or manual
entry) with a system-generated `accessId` + password before they can log in.
Some campaigns don't want that overhead: the admin wants to open a single
join link to anyone, during a scheduled window, and have candidates identify
themselves on the way in rather than being pre-registered.

## Goals

- Per-campaign opt-in: existing invite-only campaigns are completely
  unaffected unless the admin explicitly sets the new end-time field.
- No pre-added candidates required for an open-join campaign.
- Candidates identify themselves with name + email (no password) at join
  time.
- The campaign accepts joins, and runs, only within an admin-set window.
  Entry closes early enough that a candidate joining at the last possible
  moment can still finish before the window's end, and any exam still in
  progress is force-ended at the window's end — nobody's exam outlives it,
  regardless of when they started.
- The window-close mechanism (explicit end time + auto-computed last-entry
  cutoff, see below) is available to **any** scheduled campaign, invite-only
  or open-join — not gated behind `openJoinEnabled`. It's required for
  open-join campaigns (there's no other sensible way to bound them) and
  optional for invite-only ones (an upgrade over today's `gracePeriodMin`,
  opt-in per campaign).
- The admin distributes the join link themselves (e.g. by email); the system
  does not send it automatically.

## Non-goals

- Automated emailing of the join link.
- Fully anonymous entry (no name/email at all) — explicitly rejected in
  favor of name+email, so results stay attributable and duplicate/rejoin
  handling stays possible.
- Fixing `REMAINING_TASKS.txt` #28 (the separate `/candidate/waiting-room`
  countdown bug, a different screen from the one this feature touches).
- Any change to how `durationSec` itself is computed (it remains the sum of
  question `timeLimitSec`, used for the instructions page's "N minutes
  total" display). The cron's status-transition logic gains one new
  condition (below) but its existing `startedAt + durationSec` check is
  otherwise untouched.

## Data model

Two new columns:

```prisma
model Campaign {
  // ...existing fields...
  openJoinEnabled Boolean   @default(false)
  scheduledEnd    DateTime?
}
```

`scheduledAt` (window opens) and `gracePeriodMin` are unchanged, both in
schema and in their existing fallback behavior — see below.

### How the window close is determined

For **any** campaign (invite-only or open-join):

- **`scheduledEnd` is set:** this is the authoritative close time.
  `gracePeriodMin` is ignored entirely. The last moment a candidate may
  join is computed, not stored: `lastEntryAt = scheduledEnd - durationSec`
  (both are timestamps/seconds already on the campaign; `durationSec` is
  the existing auto-recomputed sum of question `timeLimitSec`, described
  below). Because it's computed at check time rather than stored, editing
  questions after `scheduledEnd` is set automatically moves `lastEntryAt`
  — if the exam gets longer, the cutoff moves earlier; shorter, it moves
  later. This is the mechanism your 43-minute/9pm/8:13pm example describes.
- **`scheduledEnd` is not set (`null`, the default):** exactly today's
  behavior — `gracePeriodMin` minutes after `scheduledAt` is the close
  time, with `gracePeriodMin === 0` meaning "no cutoff" (existing
  `JoinGate.tsx` semantics, unchanged).

`durationSec` itself is still **not** an input to anything here beyond this
one derived subtraction — it remains owned entirely by the question editor
(auto-recomputed from `Σ timeLimitSec` on every question create/update) and
is not otherwise touched by this feature.

### Validation

- `scheduledEnd`, if set, must be strictly after `scheduledAt`. Enforced at
  save time (admin API), rejected with a clear error otherwise.
- `lastEntryAt` computing to before `scheduledAt` (i.e., the exam is too
  long for the configured window, given current questions) is **not**
  blocked at save time — it's a live, dynamic relationship that can flip
  after saving if questions change. Instead, the admin UI shows it as a live
  advisory (see Admin UI below), and at runtime it behaves safely: if
  `lastEntryAt < scheduledAt`, nobody can join for the campaign's entire
  open window (rather than crashing or allowing an unfinishable attempt).
- Open-join campaigns (`openJoinEnabled = true`) require `scheduledEnd` to
  be set — enforced in the admin UI (can't enable open-join without it)
  and as defense-in-depth in the campaign update API.

## Join & registration flow

### `/join/[token]` (`JoinGate.tsx`) — extended gating, new destination

The DRAFT / SCHEDULED / ENDED states are unchanged. The LIVE/PAUSED state's
entry-window check gains a branch: `JoinPage` now also selects
`openJoinEnabled`, `scheduledEnd`, and `durationSec` from the campaign and
passes them to `JoinGate`, which computes the close time per the rule
above (`scheduledEnd` if set, else today's `scheduledAt + gracePeriodMin`)
instead of always using `gracePeriodMin`. The rendered UI is the same
either way — "Entry closes in [countdown]" / "Entry period has closed" —
only the time it counts down to changes.

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
   `campaign.status` must be `LIVE` or `PAUSED`, **and** `now` must be
   before the close time computed per the Data Model rule above
   (`scheduledEnd - durationSec` if `scheduledEnd` is set, else
   `scheduledAt + gracePeriodMin`). This is the same condition `JoinGate`
   already renders client-side as "Entry period has closed" — the API
   enforces it too, so a direct POST after the window can't bypass the UI.
   (This same check does not currently exist for the invite-only branch
   either — a pre-existing gap, now closed as part of this feature since
   the close-time computation is shared code, not duplicated per branch.)
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
during those hours strictly," and it's where `scheduledEnd` (when set)
matters most: the hard cutoff is `scheduledEnd` itself, not the
`lastEntryAt` used for gating new joins — a candidate who legitimately
joined before `lastEntryAt` still gets force-ended at `scheduledEnd`,
same as everyone else.

A shared helper (e.g. `lib/campaign-window.ts`) centralizes this
computation so it isn't duplicated across the login route, `submit-answer`,
`next-question`, and `JoinGate`'s server-passed props:

```ts
function campaignCloseAt(campaign: { scheduledAt: Date | null; scheduledEnd: Date | null; gracePeriodMin: number }): Date | null {
  if (campaign.scheduledEnd) return campaign.scheduledEnd;
  if (!campaign.scheduledAt) return null;
  return new Date(campaign.scheduledAt.getTime() + campaign.gracePeriodMin * 60_000);
}

function campaignLastEntryAt(campaign: { scheduledAt: Date | null; scheduledEnd: Date | null; gracePeriodMin: number; durationSec: number }): Date | null {
  if (campaign.scheduledEnd) return new Date(campaign.scheduledEnd.getTime() - campaign.durationSec * 1000);
  return campaignCloseAt(campaign); // no separate lastEntry concept in the legacy gracePeriodMin model
}
```

In `app/api/assessment/submit-answer/route.ts` and
`app/api/assessment/next-question/route.ts`, after resolving the
candidate's campaign, reject with a clear "time's up" error (`403`) when
`now > campaignCloseAt(campaign)`. `JoinGate` and the login route use
`campaignLastEntryAt(campaign)` for the entry-window check instead.

This check is **not** gated on `openJoinEnabled` — it applies to any
campaign with a `scheduledAt` set, open-join or invite-only alike, since the
underlying gap (nothing enforces the window server-side once a candidate is
past login) is identical in both modes and this is the correctness fix for
it. Invite-only campaigns without `scheduledEnd` set keep their current
default `gracePeriodMin` of 10 minutes, so this only changes behavior for
campaigns that were already supposed to have closed 10+ minutes ago — not a
behavior change for anyone inside a normal exam window today.

The candidate-facing exam page (`app/candidate/exam/page.tsx`) shows the
resulting error as a dedicated "time's up" state rather than the generic
error toast, redirecting to `/candidate/result` (or a new minimal
"assessment window closed" screen if `/candidate/result` assumes a
completed, scored attempt — implementation plan decides based on what state
`/candidate/result` needs).

### Cron: status transitions also respect `scheduledEnd`

Without a change here, a campaign with `scheduledEnd` in the past would
stay `status = LIVE` indefinitely on the admin dashboard (candidates are
still correctly blocked by the check above, but the status badge would be
misleading). `app/api/cron/session-scheduler/route.ts` gains one more
condition alongside its existing `durationSec`-based check: also end any
`LIVE`/`PAUSED` campaign whose `scheduledEnd` has passed. The two
conditions are independent ORs — whichever fires first ends the campaign;
neither replaces the other.

## Admin UI

`app/admin/campaigns/[id]/page.tsx` (the campaign edit/settings view):

- New field, available for **every** campaign regardless of
  `openJoinEnabled`: **"Assessment ends at"**, bound to `scheduledEnd`
  (optional datetime picker, blank by default). Saved via the existing
  `PATCH /api/admin/campaigns/[id]` endpoint (add `scheduledEnd` to its
  accepted body fields, same pattern as `gracePeriodMin`; validate
  `scheduledEnd > scheduledAt` when both are present).
- Directly below it, a **live, read-only advisory** (recomputed on every
  keystroke/change to `scheduledEnd`, `scheduledAt`, or as questions change
  elsewhere in the campaign): "Last entry allowed: **HH:MM** (assessment
  takes ~N minutes)" — or, if that computes to before `scheduledAt`, a
  visible warning: "The current questions take longer than this window
  allows — nobody will be able to join." This is advisory only, not a save
  blocker (see Validation above).
- When `scheduledEnd` is blank: no advisory shown, behavior is today's
  `gracePeriodMin`-based model, `gracePeriodMin`'s existing field/label
  ("Grace period") is shown exactly as today.
- New toggle: **"Open join (no pre-added candidates)"**, bound to
  `openJoinEnabled`. Enabling it requires `scheduledEnd` to already be set
  (inline validation error if attempted without one — "Open-join campaigns
  need an end time"). When enabled:
  - The `scheduledAt` field is labeled **"Window opens at"**.
  - The `gracePeriodMin` field/label is hidden (irrelevant once
    `scheduledEnd` is mandatory for this mode).
  - The Candidates tab's CSV-import and manual-add UI is hidden — nothing to
    pre-populate.
  - The join link (already shown today, `/join/{token}`) gets a "Copy join
    link" button if it doesn't already have one, with a short note that the
    admin should send it themselves (email, chat, etc.) — no in-app sending
    is added.
- When `openJoinEnabled` is off (default): everything behaves exactly as it
  does today, plus the new optional `scheduledEnd`/advisory described above.

`app/admin/campaigns/new/page.tsx`: same `scheduledEnd` field and
`openJoinEnabled` toggle available at creation time, both defaulting
off/blank.

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
