# PreCognise Assess

A full-stack online assessment platform built for large-scale, high-integrity candidate evaluation. Supports campaign-based assessments with real-time session control, configurable anti-cheat, comprehensive analytics, and live admin monitoring.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via [Neon](https://neon.tech) |
| ORM | Prisma |
| Auth (Admin) | Clerk |
| Auth (Candidate) | Custom JWT (`jsonwebtoken` + `bcryptjs`) |
| Real-time | Socket.IO (separate Node.js server) |
| Styling | Tailwind CSS v4 |
| Runtime | Node.js / Vercel (Next.js) + standalone process (socket server) |

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           Next.js App (Vercel)          │
│  ┌─────────────┐   ┌──────────────────┐ │
│  │  Admin UI   │   │  Candidate UI    │ │
│  │ /admin/...  │   │ /join, /candidate│ │
│  └─────────────┘   └──────────────────┘ │
│         │                  │            │
│  ┌──────────────────────────────────┐   │
│  │         API Routes               │   │
│  │  /api/admin/**  /api/candidate/** │   │
│  └──────────────────────────────────┘   │
│         │                  │            │
│  ┌──────────────────────────────────┐   │
│  │     Prisma → PostgreSQL (Neon)   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
          │                  │
┌─────────────────────────────────────────┐
│     Socket.IO Server (socket-server/)   │
│     Handles: real-time events,          │
│     tab-switch detection, broadcasts,   │
│     session start/end relay             │
└─────────────────────────────────────────┘
```

---

## Features

### Campaigns
- Create and configure assessment campaigns with name, branding (logo + background colour), duration, max candidates, and scheduled start time
- Auto-start campaigns at a scheduled time via cron (`/api/cron/session-scheduler`)
- Manual start, pause, resume, and end from the Live Session dashboard
- Import candidates from CSV/Excel — auto-generates Access IDs and hashed passwords
- State machine: `DRAFT → SCHEDULED → LIVE → PAUSED → ENDED`

### Question Builder
- Four question types: **MCQ**, **Image-based MCQ**, **Psychometric**, **Rating**
- Per-question time limit, base points, and speed bonus
- Drag-to-reorder question list
- Negative marking — configurable per campaign with a custom deduction value

### Candidate Join Flow
- Unique join link per campaign (`/join/[token]`)
- State-aware join gate:
  - **DRAFT** — not yet available
  - **SCHEDULED** — live countdown timer to start
  - **LIVE (within grace period)** — countdown of remaining entry window + Join Now
  - **LIVE (past grace period)** — entry closed
  - **PAUSED** — can still log in
  - **ENDED** — assessment closed
- Configurable candidate entry grace period (0–60 minutes after campaign goes live)

### Exam
- Sequential question delivery with per-question timer ring
- Answers submitted in real time; auto-advance on timer expiry
- Candidate session secured by JWT (`candidateId + campaignId`)

### Anti-Cheat (per-campaign toggles)
| Feature | Default |
|---|---|
| Tab switch detection + limit | On (limit: 3) |
| Fullscreen enforcement | Off |
| Copy/paste & text selection block | On |
| Right-click / context menu block | On |
| Screenshot key interception | On |
| DevTools key block (F12, Ctrl+Shift+I) | On |
| Disqualify on duplicate login | On |

Tab switch events are tracked in the database and can auto-disqualify. Fullscreen exit triggers a modal requiring the candidate to return to fullscreen.

### Live Session (Admin)
- Real-time candidate list with status badges
- Session timer progress bar (elapsed / remaining)
- Pause / Resume / End controls
- **Broadcast messages** to all active candidates — delivered via DB polling (reliable, no socket dependency) with an instant socket overlay
- Per-candidate remove / disqualify action

### Results
- Post-campaign results table with sortable columns: rank, name, access ID, score, correct answers, status, tab switch count
- Score progress bar (green ≥ 70%, amber 40–69%, red < 40%)
- Filter by status (All / Completed / Disqualified / Other) and score range
- CSV export of full candidate results

### Analytics (ENDED campaigns)
Accessible at `/admin/campaigns/[id]/analytics`:

| Section | What it shows |
|---|---|
| **Score Statistics** | Mean, Median, Mode, Std Dev, Min/Max, P25/P75, pass rate, visual spread bar |
| **Candidate Participation** | Completed / Disqualified / No-Show with stacked bar; disqualification reason breakdown |
| **Score Distribution** | CSS histogram across 5 score buckets (% of max) |
| **Test Difficulty Assessment** | Easy / Moderate / Hard / Very Hard rating; easiest & hardest questions; most time-consuming question |
| **Question Analysis** | P-value (% correct), difficulty badge, avg response time vs limit, timeout count, discrimination index, MCQ option frequency |
| **Anti-cheat & Integrity** | Tab switch totals, disqualifications by cause |
| **CSV Download** | Full analytics report |

**Discrimination Index** measures whether a question distinguishes high-scoring from low-scoring candidates (top-half vs bottom-half correct rate). ≥ 0.3 = good; negative = potentially problematic question.

### Branding
- Per-organisation logo URL and primary colour stored in `OrgBranding`
- Applied to the candidate-facing join and exam pages

---

## Project Structure

```
precognise-assess/
├── app/
│   ├── admin/                    # Admin UI (Clerk-protected)
│   │   ├── campaigns/            # Campaign list, create, manage
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Campaign overview + question builder
│   │   │       ├── results/      # Candidate results table
│   │   │       └── analytics/    # Full assessment analytics
│   │   ├── session/              # Live session dashboard
│   │   ├── branding/             # Org branding settings
│   │   └── settings/             # Assessment settings
│   ├── api/
│   │   ├── admin/campaigns/      # CRUD, start/pause/end, results, analytics, broadcast
│   │   ├── admin/branding/       # Branding CRUD
│   │   ├── auth/login/           # Candidate login (JWT)
│   │   ├── assessment/           # next-question, submit-answer, score
│   │   ├── candidate/            # campaign-config, tab-switch, broadcast
│   │   └── cron/session-scheduler/ # Auto-start scheduled campaigns
│   ├── candidate/                # Candidate-facing pages
│   │   ├── login/                # Access ID + password login
│   │   ├── exam/                 # Question delivery + anti-cheat
│   │   ├── waiting-room/         # Pre-session waiting room
│   │   ├── result/               # Post-submission result screen
│   │   └── disqualified/         # Disqualification screen
│   └── join/[token]/             # Campaign join gate
├── socket-server/                # Standalone Socket.IO server
│   └── src/
│       ├── index.ts              # Server entry, JWT auth
│       ├── handlers.ts           # Candidate + admin event handlers
│       ├── anticheat.ts          # Tab switch & page refresh logic
│       └── state.ts              # In-memory candidate/admin state
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── lib/
│   ├── jwt.ts                    # Token sign / verify
│   ├── prisma.ts                 # Prisma client singleton
│   ├── socket-client.ts          # Candidate socket singleton
│   └── admin-socket-client.ts    # Admin socket singleton
└── components/
    └── exam/                     # TimerRing, McqCard, BroadcastToast, etc.
```

---

## Environment Variables

### Next.js app (`.env.local`)

```env
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...    # For Prisma migrations (Neon direct connection)

# JWT
JWT_SECRET=your-secret-here

# Socket server URL (browser-accessible)
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000

# Clerk (admin auth) — optional; middleware is a no-op if not set
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Internal secret shared with socket server for the disqualify callback
INTERNAL_API_SECRET=your-internal-secret
```

### Socket server (`socket-server/.env`)

```env
PORT=4000
JWT_SECRET=your-secret-here          # Must match Next.js JWT_SECRET
FRONTEND_URL=http://localhost:3000   # CORS origin
INTERNAL_API_SECRET=your-internal-secret
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
cd socket-server && npm install && cd ..
```

### 2. Set up the database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. Run in development

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Socket server
cd socket-server && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Production build

```bash
npm run build   # runs prisma generate + next build
npm start
```

The socket server is a separate long-running process — deploy it to a service that supports persistent connections (Railway, Render, Fly.io, etc.).

---

## Database Schema (key models)

| Model | Purpose |
|---|---|
| `Campaign` | Assessment configuration, scheduling, anti-cheat settings, branding |
| `Candidate` | Registered participant, hashed password, JWT token, status, tab switch count |
| `Question` | Question content, type, options (JSON), time limit, points |
| `Response` | Per-candidate per-question answer, score, response time |
| `OrgBranding` | Logo URL, primary colour |
| `AssessmentSettings` | Global anti-cheat defaults |

---

## Campaign Status Flow

```
DRAFT ──► SCHEDULED ──► LIVE ──► PAUSED ──► ENDED
              │                     │
              └──── (auto-start) ───┘
```

- **DRAFT** — being configured; not accessible to candidates
- **SCHEDULED** — locked; join link shows countdown; auto-starts at `scheduledAt` if `autoStart = true`
- **LIVE** — accepting candidates within grace period; exam in progress
- **PAUSED** — session frozen; candidates can still log in but exam is halted
- **ENDED** — results and analytics available

---

## Broadcast Messaging

Admin can send a message to all active candidates from the Live Session page.

The message is written to `Campaign.lastBroadcast` via `POST /api/admin/campaigns/[id]/broadcast`. Candidates poll `GET /api/candidate/broadcast` every 20 seconds and display a toast when the message changes. A Socket.IO fast path is also attempted for instant delivery — the polling path ensures reliability regardless of socket availability.

---

## Deployment Notes

- **Next.js** — deploy to Vercel. Set all environment variables in the Vercel dashboard.
- **Socket server** — deploy to a service with persistent processes. Set `FRONTEND_URL` to your Vercel deployment URL.
- **Database migrations** — run `npx prisma migrate deploy` as part of your CI/CD pipeline or Vercel build command.
- The Clerk middleware is currently a no-op; to enable admin auth, set the Clerk env vars and update `middleware.ts`.
