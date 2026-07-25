# Multi-display detection

Date: 2026-07-25

## Summary

A new opt-in anti-cheat feature: while a campaign has it enabled, the candidate's exam page detects whether more than one display is connected to their machine, blocks the exam with an overlay while a second display remains connected, and logs every occurrence for the admin to review — without auto-disqualifying, since (unlike a missing camera) a candidate can always resolve this themselves by disconnecting the extra display.

This addresses a real gap the existing anti-cheat features (tab-switch/blur detection, fullscreen enforcement) can't close: a candidate can park reference material in a second, unfocused window on a second monitor and simply look at it, without ever triggering a `blur` or `visibilitychange` event. No browser API lets a website see the contents of another window or monitor — that's a deliberate privacy boundary — but a website *can* detect that more than one display exists, which is the mechanism this feature uses.

## Detection mechanism

`window.screen.isExtended` — a boolean, `true` when the OS reports more than one connected display. Chosen over the full Window Management API (`navigator.mediaDevices`... `getScreenDetails()`) because:
- `isExtended` requires **no permission prompt** — it's a plain synchronous property read.
- `getScreenDetails()` returns per-screen resolution/position data this feature doesn't need, and would add its own permission-denial UX to design around (mirroring the camera feature's complexity) for no benefit here.

**Browser support:** Chromium only (Chrome, Edge, Opera). `window.screen.isExtended` is `undefined` on Firefox and Safari. Per the user's explicit decision, on unsupported browsers the check is skipped silently — no warning, no block. The exam behaves exactly as it would if the toggle were off, for those candidates specifically. This is a known, accepted gap, not an oversight.

**Continuous monitoring, not one-time:** checked on an interval (every 3–5 seconds, exact value decided at implementation time) for the entire exam duration, not just once at start. There is no permission-free "change" event to subscribe to for `isExtended` (that only exists on the permission-gated `getScreenDetails()` API this feature deliberately avoids), so polling is the correct mechanism here, not a fallback.

## Data model

Add to `Campaign` (`prisma/schema.prisma`), alongside the existing anti-cheat fields:
```prisma
antiCheatMultiDisplay Boolean @default(false)
```

Add to `Candidate`, alongside `tabSwitchCount` and `cameraViolationCount`:
```prisma
multiDisplayViolationCount Int @default(0)
```

Applied via `prisma db push` (not `migrate dev`), per the established project convention from the camera feature — this database has pre-existing drift outside its migration history that makes `migrate dev` offer a destructive reset.

## Enforcement model — deliberately simpler than camera

Per the user's decision: **block until resolved, log the violation, never auto-disqualify.** Unlike a missing camera (which may not be fixable — no hardware, blocked permission), a second display is always within the candidate's control to remove immediately. So:
- No strike limit, no disqualification path, no `CandidateStatus.DISQUALIFIED` transition anywhere in this feature.
- The new violation-reporting endpoint is a plain increment-and-return, no threshold logic — simpler than `/api/candidate/camera-violation`.

## API surface

### `PATCH /api/admin/campaigns/[id]`
Accepts and persists `antiCheatMultiDisplay`, following the exact conditional-spread pattern already used for every other `antiCheat*` field in this route.

### `GET /api/candidate/campaign-config`
`antiCheatMultiDisplay: true` added to the `select`. Already spread into the response (`...candidate.campaign`) — no further change needed there.

### `GET /api/candidate/instructions`
`antiCheatMultiDisplay: true` added to the `select`; `multiDisplay: candidate.campaign.antiCheatMultiDisplay` added to the response's `antiCheat` object, following the established `antiCheatX` → `x` naming convention (`antiCheatFullscreen` → `fullscreen`, `antiCheatCamera` → `camera`, etc.).

### `POST /api/candidate/multi-display-violation` (new)
Modeled on `/api/candidate/tab-switch` and `/api/candidate/camera-violation` for auth/lookup/error shape, but simpler:
- No limit, no disqualify branch.
- Increments `multiDisplayViolationCount`, returns `{ count }`.

### `GET /api/admin/campaigns/[id]/results`
Add `multiDisplayViolationCount` to the candidate select, mirroring `tabSwitchCount`.

## Admin UI

### Overview tab (`app/admin/campaigns/[id]/page.tsx`)
New toggle in the "Anti-cheat & Security" section, styled identically to its siblings: **"Detect multiple displays"** — "Warn and log when more than one display is connected during the exam. Does not automatically disqualify — the candidate can resolve it by disconnecting the extra display."

### Results page (`app/admin/campaigns/[id]/results/page.tsx`)
New table column showing `multiDisplayViolationCount`, styled exactly like the existing "Tab switches" column (amber when > 0, gray at 0). Added to the CSV export alongside `tabSwitchCount`.

## Candidate-facing UI

### Instructions page (`app/candidate/instructions/page.tsx`)
New rule bullet, gated on `ac.multiDisplay`: "Using more than one display or monitor during the exam is not allowed. It will be detected and logged, but will not disqualify you automatically — disconnect any extra display before continuing."

(Wording explicitly tells candidates this isn't an auto-disqualify trap, unlike the camera and tab-switch rules — matches the actual enforcement model and avoids alarming candidates with borrowed monitors/docking stations they didn't realize were "extra displays.")

### Exam page (`app/candidate/exam/page.tsx`)
Gated entirely behind `settingsRef.current.antiCheatMultiDisplay` (no-op when the campaign doesn't require it, matching every other feature this session):
- New state: `multiDisplayWarning` (boolean, drives the blocking overlay).
- New ref: `multiDisplayReportedRef` (one-shot latch per occurrence, same pattern as `cameraDropReportedRef` — prevents logging the same ongoing occurrence on every poll tick; reset to `false` when the check goes back to `false`, so a later reconnect counts as a new occurrence).
- A `setInterval` started when the campaign requires this check (guarded by `typeof window.screen.isExtended === "boolean"` — skip entirely, no interval at all, if `undefined`/unsupported), polling every few seconds:
  - `true` and not yet reported this occurrence → set `multiDisplayWarning(true)`, report the violation once, latch.
  - `false` → clear `multiDisplayWarning`, unlatch.
- Blocking overlay: same visual family as the fullscreen/camera overlays (full-screen, icon, message), but **no button** — it auto-clears on the next poll tick once the extra display is gone, since there's nothing for the candidate to click that would resolve it faster than physically disconnecting the monitor.
- Interval cleared on unmount, alongside the existing cleanup in that effect.

## Explicitly out of scope

- No use of the full Window Management API / `getScreenDetails()` — no per-screen resolution or position data is collected.
- No disqualification path for this feature, ever — confirmed as the user's explicit choice.
- No support path for Firefox/Safari — the check silently doesn't run there. Not treated as a violation, not disclosed to the candidate as a gap.
- No changes to the global Settings page (`app/admin/settings/page.tsx`) or the `AssessmentSettings` Prisma model — like camera and fullscreen before it, this is campaign-scoped only.
- No admin live-session real-time indicator for this feature (unlike tab-switch, which has a socket-driven admin warning) — visibility is via the results page count only, checked after the fact. Reconsider only if the user asks for real-time visibility later.
