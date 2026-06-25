# Campaign & Live Session Redesign — Design Spec
**Date:** 2026-06-25
**Status:** Approved

---

## Overview

Consolidate the existing `Session` + `Campaign` split into a single `Campaign` entity that owns the full assessment lifecycle: creation → configuration → scheduling → live execution → completion. "Live Session" becomes a dedicated admin view for controlling running and upcoming campaigns, not a separate data model. Candidate login is simplified to Access ID + Password (OTP removed). `rollNumber` is renamed `accessId` everywhere.

Scale target: 12,000 concurrent candidates per campaign.

---

## 1. Data Model

### Drop `Session`, expand `Campaign`

The `Session` table is removed. `Campaign` becomes the sole top-level assessment entity.

```prisma
enum CampaignStatus {
  DRAFT
  SCHEDULED
  LIVE
  PAUSED
  ENDED
}

model Campaign {
  id          String         @id @default(cuid())
  name        String
  status      CampaignStatus @default(DRAFT)
  joinToken   String         @unique @default(cuid())

  // Scheduling
  scheduledAt DateTime?
  autoStart   Boolean        @default(false)
  startedAt   DateTime?
  endedAt     DateTime?

  // Duration — auto-summed from question timeLimitSec values; stored for runtime use
  durationSec Int            @default(0)

  // Per-campaign branding
  logoUrl     String?
  bgColor     String         @default("#F8FAFC")

  // Assessment settings
  maxCandidates      Int?
  negativeMarking    Boolean @default(false)
  negativeMarkingValue Float  @default(0.25)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  candidates Candidate[]
  questions  Question[]
}
```

### `Candidate` changes

- `rollNumber` column renamed to `accessId`
- `sessionId` removed; `campaignId` becomes `String` (non-optional)
- `otpCode`, `otpExpiresAt` removed (OTP step eliminated)
- Composite unique constraints updated: `@@unique([accessId, campaignId])`, `@@unique([email, campaignId])`

```prisma
model Candidate {
  id                String          @id @default(cuid())
  accessId          String
  email             String
  name              String
  passwordHash      String
  generatedPassword String?
  activeToken       String?         @unique
  country           String?
  status            CandidateStatus @default(REGISTERED)
  disqualifyReason  String?
  tabSwitchCount    Int             @default(0)

  campaignId String
  campaign   Campaign   @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responses  Response[]

  @@unique([accessId, campaignId])
  @@unique([email, campaignId])
}
```

### `Question` changes

- `sessionId` removed; `campaignId` added (non-optional)

```prisma
model Question {
  id            String       @id @default(cuid())
  type          QuestionType
  text          String
  imageUrl      String?
  options       Json
  correctOption Int?
  timeLimitSec  Int
  basePoints    Int
  speedBonusMax Int          @default(0)
  orderIndex    Int

  campaignId String
  campaign   Campaign   @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responses  Response[]
}
```

### `Response` — unchanged

### `OrgBranding` — kept for global defaults; per-campaign branding overrides it on candidate-facing pages

### `AssessmentSettings` — kept for global anti-cheat toggles

---

## 2. Campaign Management UI (`/admin/campaigns`)

### Campaign list (`/admin/campaigns`)

- Cards: campaign name, status badge, scheduled date/time, candidate count (joined / max), total duration, **Manage →** link
- **Delete** button per card → confirmation modal → deletes campaign + all candidates + questions + responses (cascade)
- Status badges: Draft (grey), Scheduled (blue), Live (green pulsing), Paused (amber), Ended (red)
- Empty state with "Create Campaign" CTA

### Create/Edit wizard (`/admin/campaigns/new` and `/admin/campaigns/[id]/edit`)

**Step 1 — Details & Branding**
- Campaign name (required)
- Logo URL input (paste a hosted image URL — no file upload, no storage service required; matches existing global branding behaviour)
- Background colour (hex colour picker + text input, default `#F8FAFC`)
- Live preview thumbnail showing org name, logo, and bg colour as candidates will see it

**Step 2 — Schedule & Settings**
- Date + time picker for `scheduledAt` (optional; leave blank to save as DRAFT)
- Auto-start toggle: on = campaign goes LIVE automatically at `scheduledAt`; off = admin starts manually from Live Session
- Max candidates (integer, required — import enforces this cap)
- Negative marking toggle → if enabled, fraction input (0.00–1.00, default 0.25) with label "deduct 0.25× base points per wrong answer"

**Step 3 — Questions**
- Inline question builder scoped to this campaign (existing builder adapted)
- **Running total duration banner** at top: "Total assessment time: 47 min 30 sec" — recalculates on every question add/edit/delete
- Per-question: type, text, options, time limit, base points, speed bonus, order handle, **Delete** button
- Negative marking indicator badge on each question when campaign has it enabled
- Saving a question recalculates and persists `campaign.durationSec`

**Step 4 — Candidates**
- Upload CSV or Excel file (`name, email` columns required; any other columns ignored)
- System validates: row count must not exceed `maxCandidates`; duplicate email within file rejected with row numbers listed
- On successful import: summary ("1,847 imported, 3 skipped") + **Download credentials** button → Excel file with columns `name, accessId, email, password`
- Candidate table: name, accessId, email, status chip, **Remove** button per row (deletes candidate + responses from DB with confirmation)
- **Add manually** form: name + email → generates accessId + password → shows inline credential card with Copy buttons
- Bulk **Remove all candidates** button (with confirmation) for re-importing a corrected file

---

## 3. Live Session (`/admin/session`)

### Upcoming view (no campaign currently LIVE)

- **Upcoming** tab: all SCHEDULED campaigns ordered by `scheduledAt`
  - Each card: campaign name, scheduled time, countdown timer, candidate count, duration
  - **Start Now** button (starts early, sets status = LIVE, startedAt = now())
  - **Start with delay** dropdown: +15 min / +30 min / +60 min (schedules a one-time delayed start)
  - If `autoStart = true`: badge "Auto-starts at [time]", Start Now still available
  - DRAFT campaigns: show with "Finish setup →" link, no start option
- **Past** tab: all ENDED campaigns, read-only, showing actual start/end times and final candidate counts

### Live view (a campaign is LIVE or PAUSED)

Shown automatically when `status = LIVE` or `PAUSED`.

- Campaign name + status badge + **time remaining bar** (elapsed / durationSec, auto-counts down)
- Auto-end: when elapsed ≥ durationSec → status → ENDED, candidates receive "assessment complete" event
- **Candidate table**: name, Access ID, email, status chip — live-updating via `stats:update` socket event
- **X / Y joined** counter + "Z in waiting room" chip above table
- **Remove candidate** button per row (disqualifies and removes — admin action, not anti-cheat)
- **Broadcast** panel: text input + Send button → toast on all candidate screens
- Control buttons: **Pause** (LIVE→PAUSED), **Resume** (PAUSED→LIVE), **End Session** (with confirmation modal)

---

## 4. Candidate Experience

### Join link

`/join/[joinToken]` behaviour:
- DRAFT → "This assessment is not yet available"
- SCHEDULED → "Assessment opens at [scheduledAt]" (countdown)
- LIVE / PAUSED → redirect to `/candidate/login?token=[joinToken]`
- ENDED → "This assessment has closed"

### Login (`/candidate/login`)

- Fields: **Access ID**, **Password**
- OTP step removed entirely
- Successful auth → direct redirect to `/candidate/waiting-room`
- Credential lookup scoped to the campaign identified by `joinToken` query param
- Error cases: wrong credentials, campaign not live, already disqualified

### Waiting room

- Shows per-campaign branding (logo + bgColor override global branding)
- "X of Y candidates in the waiting room" live counter (10s polling)
- Redirects to `/candidate/exam` on `session:start` socket event

### Exam + Result

- Unchanged functionally
- Negative marking applied at score calculation if `campaign.negativeMarking = true`

---

## 5. API Changes

### New / updated routes

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/admin/campaigns` | List all; create new |
| GET/PATCH/DELETE | `/api/admin/campaigns/[id]` | Get detail; update fields; delete campaign |
| GET/POST | `/api/admin/campaigns/[id]/candidates` | List; add single |
| POST | `/api/admin/campaigns/[id]/candidates/import` | CSV/Excel bulk import |
| DELETE | `/api/admin/campaigns/[id]/candidates/[candidateId]` | Remove single candidate |
| GET/POST | `/api/admin/campaigns/[id]/questions` | List + create questions scoped to campaign (replaces `/api/admin/questions` sessionId param) |
| PATCH/DELETE | `/api/admin/questions/[id]` | Edit + delete individual question (existing route, `sessionId` ref updated to `campaignId`) |
| POST | `/api/admin/campaigns/[id]/start` | Start campaign (early or on-time) |
| POST | `/api/admin/campaigns/[id]/pause` | Pause |
| POST | `/api/admin/campaigns/[id]/end` | End |
| GET | `/api/candidate/session-stats` | Returns `{ total, inWaitingRoom, joined }` (updated to use campaignId) |
| POST | `/api/auth/login` | Updated: accessId + password, no OTP |
| GET | `/api/cron/session-scheduler` | Updated: operates on Campaign model |

### Removed routes

- `/api/auth/verify-otp` — OTP eliminated
- `/api/auth/login` OTP-dispatch logic removed
- `/api/apply/[slug]` — public apply links removed
- `/api/admin/session/**` — replaced by `/api/admin/campaigns/**`

---

## 6. Global Renames

| Old | New | Locations |
|---|---|---|
| `rollNumber` | `accessId` | DB schema, all API bodies/responses, all UI labels, candidate login page, socket payloads, JWT payload field name. **Note:** existing in-flight JWTs with `rollNumber` claim will be rejected after migration — this is intentional (any active exam session is invalidated by the migration). |
| `sessionId` | `campaignId` | DB schema, all API routes, all React state, socket handlers |
| "Session" (UI label) | "Campaign" (creation) / "Live Session" (execution view) | Admin nav, page titles, breadcrumbs |

---

## 7. Removed Features

- OTP email verification step
- `/apply/[slug]` public candidate self-registration
- Global `Campaign.slug` field
- `Session` table
- `sessionId` foreign keys on Candidate and Question

---

## 8. Scale & Reliability Notes

- All candidate lookups use indexed `campaignId` + `accessId` composite — fast at 12,000 rows
- `activeToken` claim remains atomic (`updateMany where activeToken = null`) — prevents duplicate login race at high concurrency
- Credential import uses `createMany` in a single transaction — handles 12,000 rows without N+1
- `durationSec` stored on Campaign (not computed at runtime) — auto-end cron/polling reads a single field
- Auto-end via 60s client-side polling on Live Session page (Vercel Hobby cron fires daily as fallback)
