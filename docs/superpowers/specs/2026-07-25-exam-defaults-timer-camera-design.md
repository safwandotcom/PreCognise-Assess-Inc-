# Exam defaults, sticky timer, and camera/mic presence check

Date: 2026-07-25

## Summary

Three independent changes to the candidate exam experience and campaign configuration:

1. New campaigns start with all friction-prone anti-cheat rules **off**; admins opt in per campaign.
2. The question timer stays visible on screen while scrolling on mobile.
3. Admins can require camera & microphone presence (visual/audio check only, nothing recorded) as a new anti-cheat toggle, enforced the same way the existing fullscreen requirement is.

## 1. Anti-cheat defaults off

`Campaign` (prisma/schema.prisma) currently defaults these to `true`:
- `antiCheatTabSwitch`
- `antiCheatCopyPaste`
- `antiCheatRightClick`
- `antiCheatScreenshot`
- `antiCheatDevTools`

Flip all five to `@default(false)`. Requires a Prisma migration (`prisma migrate dev` locally, deployed via the project's existing migration pipeline).

**Unchanged:**
- `antiCheatFullscreen`, `antiCheatShuffleQuestions`, `antiCheatShuffleAnswers` — already default `false`.
- `disqualifyOnDuplicateLogin` — stays `@default(true)`. Confirmed with the user: this guards against credential sharing/duplicate sessions, a different concern from candidate-triggered friction, and should keep working out of the box.

No application code changes needed for this item — the Overview tab toggles, the `PATCH /api/admin/campaigns/[id]` route, and campaign creation all already read/write these fields; only the schema default changes. Existing campaigns are unaffected (a schema default only applies to new rows).

## 2. Sticky timer on mobile

In `app/candidate/exam/page.tsx`, the header row containing `QuestionProgress` and `TimerRing` currently scrolls out of view with the rest of the page. Long question text or many MCQ options push it off-screen, so a candidate on a phone loses sight of the remaining time.

Make that header row `sticky top-0` with an opaque background (matching the page's `bg-gray-900`) and a `z-index` above the question content, so it stays pinned while the question body scrolls underneath. Applied at all breakpoints (not just mobile) — simpler than a media-query variant, and harmless on desktop where the page is usually short enough that it never mattered.

## 3. Camera & microphone presence check

A new per-campaign anti-cheat option. Scope, per user's answers: **presence check only** — verifies the candidate has a working camera/mic and keeps them available for the whole exam. Nothing is recorded, stored, or transmitted anywhere; it is purely a client-side, in-browser check.

### Data model

Add to `Campaign` in `prisma/schema.prisma`:
```
antiCheatCamera Boolean @default(false)
```
Single combined toggle (camera + microphone together), not two separate switches — per user's answer.

### Admin: Overview tab (`app/admin/campaigns/[id]/page.tsx`)

Add `antiCheatCamera` alongside the other anti-cheat fields in `OverviewTab`:
- Local state + sync-on-campaign-change effect, following the exact pattern already used for `antiCheatScreenshot`/`antiCheatDevTools`/etc.
- Included in the `PATCH` save payload.
- A new `SettingRow`-style toggle in the anti-cheat section, labeled "Require camera & microphone" with a short description ("Candidate must grant camera and microphone access and keep it on for the whole exam.").

### API

- `PATCH /api/admin/campaigns/[id]/route.ts`: destructure and conditionally apply `antiCheatCamera`, same pattern as the other `antiCheat*` fields (`...(antiCheatCamera !== undefined && { antiCheatCamera })`).
- `GET /api/candidate/campaign-config/route.ts`: add `antiCheatCamera: true` to the `campaign` select — it's already spread into the response (`...candidate.campaign`), so no further change needed there.
- `GET /api/candidate/instructions/route.ts`: add `antiCheatCamera: true` to the select, and `camera: candidate.campaign.antiCheatCamera` to the returned `antiCheat` object.

### Instructions page (`app/candidate/instructions/page.tsx`)

- Add `camera: boolean` to the local `AntiCheat` interface.
- Add a rule bullet when `ac.camera` is true: "You must allow camera and microphone access, and keep it on, for the entire exam." Reuses the existing acknowledgment checkbox — no separate consent step.

### Shared settings type (`lib/get-settings.ts`)

Add `antiCheatCamera: boolean` to the `AssessmentSettings` type and `SETTINGS_DEFAULTS` (`false`). Like `antiCheatFullscreen` and `antiCheatRightClick` already in this file, `getSettings()` returns the hardcoded default for this field rather than reading it from the `AssessmentSettings` DB model — camera enforcement is purely per-campaign, following the existing precedent for the other campaign-only fields declared in this shared type.

### Exam page (`app/candidate/exam/page.tsx`)

New behavior, gated entirely behind `settingsRef.current.antiCheatCamera` (no-op — no permission prompt, no code path touched — when the campaign doesn't require it):

- After campaign config loads (same point where fullscreen is currently requested), if the toggle is on, call `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`.
- **Success**: keep the `MediaStream` in a ref; attach `track.onended` to every track. Render a small live self-view thumbnail (new `components/exam/CameraSelfView.tsx`: muted `<video>` bound to the stream, fixed in a screen corner, plus a small green/red dot reflecting whether the audio track is live). Nothing from the stream is ever uploaded or persisted.
- **Failure** (denied, no device, or a track's `ended` fires later — e.g. unplugged or revoked via the browser's own camera indicator): set a `cameraWarning` state that renders a full-screen blocking overlay — same visual pattern as the existing `fullscreenWarning` overlay — with a "Grant camera & microphone access" button that retries `getUserMedia`. Also calls the existing `handleTabSwitch()` violation logger, so a camera lapse counts toward the same tab-switch limit/disqualification threshold already enforced server-side via `/api/candidate/tab-switch` — no new violation-tracking endpoint.
- On unmount, stop all tracks on the held stream.

### Explicitly out of scope

- No recording, snapshotting, or upload of camera/mic data.
- No live-streaming to the admin's session-monitoring page.
- No separate camera-only / mic-only toggles.
- No changes to the global "Settings" page (`app/admin/settings/page.tsx`) or the `AssessmentSettings` Prisma model — camera enforcement is campaign-scoped only, matching how fullscreen/right-click are already handled.
