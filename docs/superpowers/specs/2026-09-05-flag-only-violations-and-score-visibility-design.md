# Flag-Only Violations & Score Visibility — Design Spec

## Problem

Today, when a candidate exceeds an automated anti-cheat limit (tab-switch or
camera/mic access denial), they are disqualified immediately and their
session ends on the spot. Some admins want the opposite: let the candidate
keep taking the assessment uninterrupted, but record what happened so the
admin can review it themselves afterward and decide what to do — without
tipping the candidate off that anything was flagged.

Separately, admins currently have no way to see a candidate's running or
final score from the candidate list — not on the Candidates tab, not on the
Live Session page — even though the score is already being computed and
stored per answer.

## Goals

- A per-campaign toggle: when off, an exceeded tab-switch or camera
  violation limit records the reason but does not disqualify the candidate
  or end their session — they continue exactly as before, with zero visible
  indication anything happened.
- The admin can see, for any candidate, whether an automated violation was
  flagged and why — visible in both the Candidates tab and Live Session —
  distinct from an actual "Disqualified" status.
- The admin's own manual "Disqualify" action, and the existing "Block
  duplicate logins" setting, are unaffected — both are deliberate actions
  with their own existing semantics, not automated violation detection.
- A Score column, showing the running/final total, added to both the
  Candidates tab and Live Session — for every status, including
  Disqualified.
- Default (`autoDisqualifyOnViolation = true`) preserves exactly today's
  behavior — existing campaigns are unaffected unless an admin explicitly
  turns it off.

## Non-goals

- Changing the admin's manual "Disqualify" action (`/api/admin/disqualify`)
  — always immediate, regardless of this setting.
- Changing "Block duplicate logins" (`disqualifyOnDuplicateLogin`) — already
  has its own on/off semantics (disqualify vs. soft-block-the-second-device)
  and is a different trigger (a login collision, not an in-exam violation).
- Multi-display violations — these are already recorded as a count only and
  never disqualify today (confirmed in code); out of scope, unchanged.
- Cleaning up the legacy socket-based anti-cheat path in `socket-server/`
  (`anticheat.ts`'s `handleTabSwitch`/`handlePageRefresh`/`disqualifyCandidate`,
  the `tab:switch`/`page:refresh`/`admin:disqualify` socket events, and the
  candidate exam page's `SocketEvents.WARNING`/`TabSwitchModal`). Confirmed
  by grep that nothing in the current frontend emits the socket events this
  code listens for — it is dead code from a superseded architecture, not
  exercised by any live path this feature touches. Not removing it as part
  of this change; noting it exists for whoever eventually does.
- Suppressing the camera-attempts counter ("Attempt 2 of 3") shown to the
  candidate while their camera/mic access is being negotiated. That UI is
  about camera/hardware troubleshooting — helping a candidate understand
  why the permission prompt keeps recurring — not about warning them of
  impending disqualification, and it fires regardless of this setting.

## Data model

One new column:

```prisma
model Campaign {
  // ...existing fields...
  autoDisqualifyOnViolation Boolean @default(true)
}
```

No `Candidate` schema change. `Candidate.disqualifyReason` (`String?`,
already exists) and `Candidate.status` are already independent columns —
today's code just always writes them together. This feature is exactly
that decoupling: writing `disqualifyReason` without writing `status`.

## Violation endpoints

`app/api/candidate/tab-switch/route.ts` and
`app/api/candidate/camera-violation/route.ts` both already select
`campaign.antiCheatTabSwitch`/`tabSwitchLimit` (tab-switch) or nothing
campaign-specific (camera, which is a fixed global limit). Both add
`campaign.autoDisqualifyOnViolation` to their campaign select.

When the violation count exceeds the limit:

- **`autoDisqualifyOnViolation` is `true` (default):** exactly today's
  code — `status: DISQUALIFIED`, `activeToken: null`, response
  `{ disqualified: true, ... }`.
- **`autoDisqualifyOnViolation` is `false`:** update only
  `[tabSwitchCount|cameraViolationCount]` and `disqualifyReason` — leave
  `status` and `activeToken` untouched. Response is
  `{ disqualified: false, ... }` (the same shape the "not yet exceeded"
  branch already returns), so the client's existing
  `if (data.disqualified) { …redirect… }` check does nothing different —
  **no client-side code changes are needed** for the candidate to
  experience zero interruption.

`disqualifyReason` accumulates rather than overwrites, since a candidate
could trigger both a tab-switch flag and a camera flag independently in
flag-only mode and an admin should see both:

```ts
const reasonLine = `Flagged: exceeded tab switch limit (${limit} allowed).`;
const disqualifyReason = candidate.disqualifyReason
  ? `${candidate.disqualifyReason}\n${reasonLine}`
  : reasonLine;
```

(Same pattern in `camera-violation/route.ts` with its own reason line.)
Each endpoint only appends its own reason line once truly needed —
concretely, since this write happens exactly at the same "exceeded"
transition point as the current disqualify branch, a given endpoint fires
this at most once per violation-limit crossing, same cardinality as today's
one-time disqualification. Repeated crossings past the limit (candidate
keeps switching tabs after already flagged) would append again each time
count is re-evaluated as exceeded — acceptable and arguably useful (shows
the admin it kept happening), not required to dedupe further.

## Admin UI — campaign settings

New toggle at the top of the existing "Anti-cheat & Security" section
(`app/admin/campaigns/[id]/page.tsx`, `OverviewTab`), before "Tab switch
detection" — it's a policy that governs both anti-cheat toggles below it,
not itself a detection method to enable/disable:

- **"Auto-disqualify on violations"** (default on). Description: "On:
  exceeding the tab-switch or camera violation limit disqualifies the
  candidate immediately and ends their session, exactly as today. Off:
  violations are recorded and visible to you here, but the candidate's
  session continues uninterrupted — nothing is shown to them."
- Same toggle-switch markup as the existing "Block duplicate logins"
  toggle (`role="switch"`, `aria-checked`, the two-span thumb, the
  `<label className="flex cursor-pointer items-center justify-between
  rounded-lg border border-[#E2E8F0] px-4 py-3">` wrapper) for visual
  consistency.
- Persisted via the existing `PATCH /api/admin/campaigns/[id]` endpoint,
  which gains `autoDisqualifyOnViolation` in its accepted body fields —
  a plain boolean, no cross-field validation needed (unlike
  `scheduledEnd`/`openJoinEnabled`).

## Candidate list — score and flagged-reason visibility

Both consuming UIs (Candidates tab, Live Session) read from the same
endpoint, `GET /api/admin/campaigns/[id]/candidates`, which already selects
`disqualifyReason`. Two additions to that endpoint's response, computed
per candidate:

- **`score: number`** — sum of that candidate's `Response.score` rows
  (the same "fetch responses, `.reduce((sum, r) => sum + r.score, 0)`"
  pattern the existing results endpoint already uses), covering every
  status: in-progress (live running total), completed (final total), and
  disqualified (whatever they'd scored before being cut off, or their
  full score if they were only flagged and kept going).
- **`flagged: boolean`** — `true` when `disqualifyReason` is set but
  `status !== "DISQUALIFIED"`. This is the distinguishing signal the UI
  needs: a `DISQUALIFIED` candidate already shows a red status badge and
  (per the just-shipped Live Session change) their reason underneath it;
  a `flagged` candidate shows their normal status badge (Active, Completed,
  whatever they legitimately reached) plus a separate, visually distinct
  amber "Flagged" indicator with the same reason text underneath.

Both `app/admin/campaigns/[id]/page.tsx` (`CandidatesTab`'s table) and
`app/admin/session/page.tsx` (the Live Session candidate table) get:

- A new **Score** column, rendered for every row regardless of status.
- The status cell logic extended: `DISQUALIFIED` renders as today (red
  badge + reason, per the Live Session change already shipped — this spec
  adds the equivalent to the Candidates tab, which doesn't have it yet);
  `flagged && status !== "DISQUALIFIED"` renders the normal status badge
  plus a small amber "Flagged" badge and the reason text underneath, using
  the same visual pattern (a `<p>` under the badge, plus a `title`
  attribute for hover) already established for the Disqualified case.

## Edge cases

- **A flagged candidate later gets manually disqualified by the admin:**
  works unchanged — `/api/admin/disqualify` sets `status: DISQUALIFIED`
  and `reason` (overwriting, per its existing behavior) regardless of any
  prior flag; the UI then shows the normal Disqualified treatment, and the
  earlier flag's reason is superseded (acceptable — the admin was looking
  right at the flag when they chose to act on it).
- **`autoDisqualifyOnViolation` is toggled off mid-campaign, after some
  candidates are already `DISQUALIFIED` from earlier violations:** no
  retroactive change — those candidates stay disqualified. The toggle only
  affects violations from that point forward.
- **A flagged candidate's `disqualifyReason` accumulates multiple lines**
  (tab-switch flag, then later a camera flag): both render together in the
  reason text (newline-joined) — no truncation added, matching how the
  field already has no length cap today.

## Open items for the implementation plan

- Exact amber color tokens for the new "Flagged" badge (pick something
  visually distinct from both the existing status badge palette
  (`CANDIDATE_STATUS_STYLES`) and the red Disqualified treatment —
  amber-50/amber-700 is the natural choice, already used elsewhere in this
  codebase for warning-toned UI, e.g. the camera-attempt counter).
