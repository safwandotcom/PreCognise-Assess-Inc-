# Session System Redesign — Design Spec
**Date:** 2026-06-24  
**Status:** Approved

---

## Overview

Replace the current single-row, toggle-only session model with a full session lifecycle: create → configure candidates & questions → schedule or launch → live control. Each session gets a unique join URL. Candidates are imported via CSV (passwords auto-generated) or added manually. Duplicate logins disqualify both parties.

---

## 1. Data Model Changes

### Session — new fields

| Field | Type | Notes |
|---|---|---|
| `title` | `String` | Human label, e.g. "Batch A – June 2026" |
| `joinToken` | `String @unique` | Random slug; forms `/join/[joinToken]` |
| `scheduledAt` | `DateTime?` | When session opens; null = manual-only |
| `autoStart` | `Boolean @default(false)` | If true, auto-transitions to LIVE at `scheduledAt` |

### SessionStatus enum — new value

```
SCHEDULED → WAITING → LIVE → PAUSED → ENDED
```

- `SCHEDULED` — created, not yet open
- `WAITING` — scheduled time reached (or manually unlocked); Start button enabled
- `LIVE` — exam is running
- `PAUSED` — temporarily paused
- `ENDED` — session closed

### Candidate — new fields

| Field | Type | Notes |
|---|---|---|
| `generatedPassword` | `String?` | Plain-text password stored temporarily for admin credential sheet export |
| `activeToken` | `String? @unique` | Set on OTP verification success; duplicate = disqualify both |

---

## 2. Admin UI — Session List & Creation Wizard

### `/admin/session` — Session List

- Replaces current single-panel page
- Shows all sessions as cards: title, status badge, scheduled time, candidate count, copy join link button
- "New Session" button opens the creation wizard

### `/admin/session/new` — 3-Step Creation Wizard

**Step 1 — Setup**
- Title input
- Start mode toggle: Manual | Scheduled
  - If Scheduled: date/time picker + sub-toggle (Auto-start at time / Unlock for manual start)
- Join URL displayed (auto-generated, copyable)
- Manual-start sessions saved as `WAITING` on wizard completion (Start button immediately available)
- Scheduled sessions saved as `SCHEDULED` on wizard completion (transitions to WAITING at scheduledAt)

**Step 2 — Candidates**

Two sub-tabs:

*CSV Upload*
- Accepts columns: `name, rollNumber, email`
- System generates a random secure password per candidate, hashes it, stores plain text in `generatedPassword`
- After import: modal shows downloadable credential CSV (`name, rollNumber, email, password`)
- Plain-text passwords can be cleared after download

*Add Manually*
- Inline form: name, rollNumber, email
- Password auto-generated same as CSV path
- One candidate at a time

**Step 3 — Questions**
- Renders the existing question builder (`/admin/questions`) scoped to this session's ID
- No rebuild required — just context-scope the existing page

### `/admin/session/[id]` — Session Detail / Live Control

- Join link with copy button
- Candidate list: status chips (REGISTERED / JOINED / ACTIVE / COMPLETED / DISQUALIFIED), manual-add form for last-minute entries
- Live controls: Start / Pause / End buttons (respecting current status)
- Broadcast message panel (existing functionality)
- Questions tab linking to builder scoped to this session

---

## 3. Join Link & Candidate Auth Flow

### `/join/[token]` — Public route

| Session state | Behaviour |
|---|---|
| SCHEDULED / WAITING / LIVE | Redirect to `/candidate/login?token=[token]` |
| ENDED | Show "This session has closed" |
| Not found | Show "Invalid link" |

### Candidate Login (updated)

- Login page reads `token` query param, passes to `/api/auth/login`
- Auth API validates credentials scoped to the session identified by `token`
- Same rollNumber/email can exist in different sessions without conflict

### Duplicate Login Detection — at OTP verification

1. After OTP verified successfully, check `candidate.activeToken`
2. **If already set** → mark both the existing candidate and current attempt as `DISQUALIFIED`, clear both `activeToken` values, return error: *"Your credentials have been used on another device — both attempts have been disqualified."*
3. **If not set** → generate `activeToken` (UUID), store on candidate, store in browser `sessionStorage`, proceed to waiting room
4. `activeToken` sent with all exam API calls as proof of legitimate session

### Generated Password Distribution

- After CSV import or manual add, admin downloads a credential CSV (one-time modal)
- `generatedPassword` is the only moment plain-text is visible to admin
- Field can be cleared post-download or retained until session ends for recovery

---

## 4. Scheduling Mechanism

**API route:** `GET /api/cron/session-scheduler`

- Queries all sessions where `status = SCHEDULED` and `scheduledAt <= now()`
- For each:
  - `autoStart = true` → update status to `LIVE`, set `startedAt`, emit `session:start` via socket
  - `autoStart = false` → update status to `WAITING` (unlocks Start button in UI)
- Called by Vercel Cron on a 1-minute interval (configured in `vercel.json`)
- Fallback: admin session detail page polls `/api/cron/session-scheduler` every 60s when a scheduled session is open

---

## 5. Edge Cases

| Scenario | Behaviour |
|---|---|
| CSV has duplicate rollNumber within same upload | Reject entire import, show which rows conflict |
| CSV rollNumber already exists in session | Skip row, report as warning |
| Admin tries to start already-LIVE session | Button disabled, no-op |
| Candidate joins after session ENDED | `/join/[token]` shows closed message |
| Admin adds candidate after session goes LIVE | Candidate can still log in; enters waiting room immediately |
| `scheduledAt` passes while admin is on wizard | Status transitions in background; wizard save still works |

---

## 6. Files Affected

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add fields + SCHEDULED status |
| `prisma/migrations/` | New migration |
| `app/admin/session/page.tsx` | Replace with session list |
| `app/admin/session/new/page.tsx` | New — 3-step wizard |
| `app/admin/session/[id]/page.tsx` | New — detail/live control |
| `app/join/[token]/page.tsx` | New — public join redirect |
| `app/api/admin/session/route.ts` | Update GET/POST, add session creation |
| `app/api/admin/session/[id]/route.ts` | New — per-session CRUD |
| `app/api/admin/candidates/route.ts` | New — CSV import + manual add |
| `app/api/auth/login/route.ts` | Scope auth to session token |
| `app/api/auth/verify-otp/route.ts` | Add duplicate activeToken check |
| `app/api/cron/session-scheduler/route.ts` | New — scheduling cron |
| `app/candidate/login/page.tsx` | Read token from query param |
| `vercel.json` | Add cron job config |
