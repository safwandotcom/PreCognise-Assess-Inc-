# Session System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-row toggle-only session model with a full lifecycle: create → configure candidates & questions → schedule or launch → live control, each with a unique `/join/[token]` URL.

**Architecture:** New sessions are created via a 3-step wizard (setup → candidates → questions), stored as multi-row Session records with a `joinToken`. Candidates are imported via CSV or added manually with auto-generated passwords. Duplicate logins at OTP verification disqualify both attempts via an `activeToken` field. A Vercel Cron route handles scheduled auto-start.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL), bcryptjs, jsonwebtoken, Socket.IO, Tailwind CSS, Clerk (admin auth), Vercel Cron

## Global Constraints

- All admin API routes are protected by Clerk middleware (already configured in `middleware.ts`) — do not add extra auth checks
- Candidate JWT signed with `JWT_SECRET` env var via `lib/jwt.ts` `signToken(candidateId, rollNumber)` — 4h expiry
- Password generation via `lib/campaign-utils.ts` `generatePassword()` — 8-char alphanumeric, no ambiguous chars
- Password hashing via `lib/campaign-utils.ts` `hashPassword(plain)` — bcrypt rounds 10
- Prisma client imported as `import { prisma } from "@/lib/prisma"`
- All API routes return `NextResponse.json(...)` — no plain `Response`
- Tailwind color palette: primary `#2E0BFC`, text dark `#0F172A`, text muted `#64748B`, border `#E2E8F0`, bg light `#F8FAFC`
- No test framework exists — verify each task with `npx tsc --noEmit` + browser smoke test

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add SCHEDULED status, Session fields, Candidate fields |
| `prisma/migrations/` | Generate | New migration via `prisma migrate dev` |
| `app/api/admin/session/route.ts` | Modify | GET all sessions list; POST create session |
| `app/api/admin/session/[id]/route.ts` | Create | GET, PATCH, DELETE single session |
| `app/api/admin/session/[id]/candidates/route.ts` | Create | GET list, POST add single candidate |
| `app/api/admin/session/[id]/candidates/import/route.ts` | Create | POST CSV import |
| `app/api/admin/questions/route.ts` | Modify | Accept `?sessionId=` query param |
| `app/api/admin/questions/[id]/route.ts` | Check | Confirm it uses sessionId correctly (no change expected) |
| `app/api/cron/session-scheduler/route.ts` | Create | Auto-start / unlock scheduled sessions |
| `app/api/auth/login/route.ts` | Modify | Accept `joinToken`, scope candidate lookup to session |
| `app/api/auth/verify-otp/route.ts` | Modify | Set/check `activeToken`, disqualify both on duplicate |
| `app/join/[token]/page.tsx` | Create | Public join redirect page |
| `app/admin/session/page.tsx` | Rewrite | Session list with New Session button |
| `app/admin/session/new/page.tsx` | Create | 3-step creation wizard |
| `app/admin/session/[id]/page.tsx` | Create | Session detail: candidates, live control, broadcast |
| `app/candidate/login/page.tsx` | Modify | Read `?token=` query param, pass to auth API |
| `vercel.json` | Create | Cron job config for session-scheduler |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Generate: `prisma/migrations/` (via CLI)

**Interfaces:**
- Produces: `Session.joinToken: String`, `Session.title: String`, `Session.scheduledAt: DateTime?`, `Session.autoStart: Boolean`, `Candidate.generatedPassword: String?`, `Candidate.activeToken: String?`, `SessionStatus.SCHEDULED`

- [ ] **Step 1: Update schema.prisma**

Open `prisma/schema.prisma` and apply these changes:

```prisma
enum SessionStatus {
  SCHEDULED
  WAITING
  LIVE
  PAUSED
  ENDED
}

model Session {
  id           String        @id @default(cuid())
  title        String        @default("Untitled Session")
  joinToken    String        @unique @default(cuid())
  status       SessionStatus @default(WAITING)
  scheduledAt  DateTime?
  autoStart    Boolean       @default(false)
  startedAt    DateTime?
  createdAt    DateTime      @default(now())

  candidates Candidate[]
  questions  Question[]
  campaigns  Campaign[]
}

model Candidate {
  id                String          @id @default(cuid())
  rollNumber        String          @unique
  email             String          @unique
  passwordHash      String
  generatedPassword String?
  activeToken       String?         @unique
  name              String
  country           String?
  status            CandidateStatus @default(REGISTERED)
  disqualifyReason  String?
  tabSwitchCount    Int             @default(0)
  otpCode           String?
  otpExpiresAt      DateTime?

  sessionId  String
  session    Session    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  campaignId String?
  campaign   Campaign?  @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  responses  Response[]
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_session_scheduling_and_candidate_tokens
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add SCHEDULED status, joinToken, scheduledAt, autoStart to Session; add generatedPassword, activeToken to Candidate"
```

---

## Task 2: Session CRUD API

**Files:**
- Modify: `app/api/admin/session/route.ts`
- Create: `app/api/admin/session/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma.session`, `SessionStatus` from `@prisma/client`
- Produces:
  - `GET /api/admin/session` → `{ sessions: SessionSummary[] }`
  - `POST /api/admin/session` → `{ session: { id, joinToken, ... } }`
  - `GET /api/admin/session/[id]` → `{ session: SessionDetail }`
  - `PATCH /api/admin/session/[id]` → `{ session: SessionDetail }`
  - `DELETE /api/admin/session/[id]` → `{ ok: true }`

- [ ] **Step 1: Rewrite `app/api/admin/session/route.ts`**

```typescript
// app/api/admin/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

const ACTION_TO_STATUS: Record<string, SessionStatus> = {
  start: SessionStatus.LIVE,
  pause: SessionStatus.PAUSED,
  end: SessionStatus.ENDED,
  unlock: SessionStatus.WAITING,
};

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { candidates: true, questions: true } },
      },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("GET /api/admin/session error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, scheduledAt, autoStart, action, id } = body;

    // Legacy live-control action (start/pause/end/unlock) on a specific session
    if (action && id) {
      const status = ACTION_TO_STATUS[action];
      if (!status) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
      const session = await prisma.session.update({
        where: { id },
        data: {
          status,
          ...(action === "start" ? { startedAt: new Date() } : {}),
        },
      });
      return NextResponse.json({ ok: true, status: session.status });
    }

    // Create new session
    const session = await prisma.session.create({
      data: {
        title: title?.trim() || "Untitled Session",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        autoStart: autoStart ?? false,
        status: scheduledAt ? SessionStatus.SCHEDULED : SessionStatus.WAITING,
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/session error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/admin/session/[id]/route.ts`**

```typescript
// app/api/admin/session/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        candidates: {
          select: {
            id: true,
            rollNumber: true,
            name: true,
            email: true,
            status: true,
            disqualifyReason: true,
            tabSwitchCount: true,
          },
          orderBy: { rollNumber: "asc" },
        },
        _count: { select: { questions: true } },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    console.error("GET /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, scheduledAt, autoStart, action } = body;

    if (action) {
      const statusMap: Record<string, SessionStatus> = {
        start: SessionStatus.LIVE,
        pause: SessionStatus.PAUSED,
        end: SessionStatus.ENDED,
        unlock: SessionStatus.WAITING,
      };
      const status = statusMap[action];
      if (!status) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      }
      const session = await prisma.session.update({
        where: { id },
        data: {
          status,
          ...(action === "start" ? { startedAt: new Date() } : {}),
        },
      });
      return NextResponse.json({ ok: true, status: session.status });
    }

    const session = await prisma.session.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        ...(autoStart !== undefined ? { autoStart } : {}),
      },
    });
    return NextResponse.json({ session });
  } catch (err) {
    console.error("PATCH /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/session/[id] error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test**

Start the dev server (`npm run dev`). In a REST client or browser console:
```js
fetch('/api/admin/session', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Test Session' }) }).then(r => r.json()).then(console.log)
```
Expected: `{ session: { id: "...", joinToken: "...", status: "WAITING", ... } }`

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/session/route.ts app/api/admin/session/[id]/route.ts
git commit -m "feat: session CRUD API — list, create, get, patch, delete"
```

---

## Task 3: Session Candidates API

**Files:**
- Create: `app/api/admin/session/[id]/candidates/route.ts`
- Create: `app/api/admin/session/[id]/candidates/import/route.ts`

**Interfaces:**
- Consumes: `generatePassword`, `hashPassword`, `makeRollNumber` from `@/lib/campaign-utils`; `prisma.candidate`
- Produces:
  - `GET /api/admin/session/[id]/candidates` → `{ candidates: CandidateSummary[] }`
  - `POST /api/admin/session/[id]/candidates` body `{ name, email, rollNumber? }` → `{ candidate, password: string }`
  - `POST /api/admin/session/[id]/candidates/import` body `{ rows: {name, rollNumber, email}[] }` → `{ created: ImportedCandidate[], skipped: string[] }`

- [ ] **Step 1: Create `app/api/admin/session/[id]/candidates/route.ts`**

```typescript
// app/api/admin/session/[id]/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword } from "@/lib/campaign-utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const candidates = await prisma.candidate.findMany({
      where: { sessionId: id },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        status: true,
        disqualifyReason: true,
        tabSwitchCount: true,
      },
      orderBy: { rollNumber: "asc" },
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("GET /api/admin/session/[id]/candidates error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { name, email, rollNumber } = await req.json();

    if (!name?.trim() || !email?.trim() || !rollNumber?.trim()) {
      return NextResponse.json(
        { error: "name, email, and rollNumber are required" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const emailNorm = email.trim().toLowerCase();
    const existing = await prisma.candidate.findFirst({
      where: { OR: [{ email: emailNorm }, { rollNumber: rollNumber.trim() }], sessionId: id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A candidate with this email or roll number already exists in this session" },
        { status: 409 }
      );
    }

    const plainPassword = generatePassword();
    const passwordHash = await hashPassword(plainPassword);

    const candidate = await prisma.candidate.create({
      data: {
        rollNumber: rollNumber.trim(),
        email: emailNorm,
        name: name.trim(),
        passwordHash,
        generatedPassword: plainPassword,
        sessionId: id,
      },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        status: true,
      },
    });

    return NextResponse.json({ candidate, password: plainPassword }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/session/[id]/candidates error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/admin/session/[id]/candidates/import/route.ts`**

```typescript
// app/api/admin/session/[id]/candidates/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword } from "@/lib/campaign-utils";

type ImportRow = { name: string; rollNumber: string; email: string };
type ImportedCandidate = { rollNumber: string; name: string; email: string; password: string };

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { rows }: { rows: ImportRow[] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Detect intra-batch duplicates before touching the DB
    const batchRolls = rows.map((r) => r.rollNumber?.trim()).filter(Boolean);
    const batchEmails = rows.map((r) => r.email?.trim().toLowerCase()).filter(Boolean);
    const dupRolls = batchRolls.filter((r, i) => batchRolls.indexOf(r) !== i);
    const dupEmails = batchEmails.filter((e, i) => batchEmails.indexOf(e) !== i);

    if (dupRolls.length > 0 || dupEmails.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate entries in CSV",
          duplicateRollNumbers: [...new Set(dupRolls)],
          duplicateEmails: [...new Set(dupEmails)],
        },
        { status: 422 }
      );
    }

    const created: ImportedCandidate[] = [];
    const skipped: string[] = [];

    for (const row of rows) {
      if (!row.name?.trim() || !row.email?.trim() || !row.rollNumber?.trim()) {
        skipped.push(`Row missing name, email, or rollNumber`);
        continue;
      }

      const email = row.email.trim().toLowerCase();
      const rollNumber = row.rollNumber.trim();

      const exists = await prisma.candidate.findFirst({
        where: {
          sessionId: id,
          OR: [{ email }, { rollNumber }],
        },
      });
      if (exists) {
        skipped.push(`${rollNumber} / ${email} — already in session`);
        continue;
      }

      const plainPassword = generatePassword();
      const passwordHash = await hashPassword(plainPassword);

      await prisma.candidate.create({
        data: {
          rollNumber,
          email,
          name: row.name.trim(),
          passwordHash,
          generatedPassword: plainPassword,
          sessionId: id,
        },
      });

      created.push({ rollNumber, name: row.name.trim(), email, password: plainPassword });
    }

    return NextResponse.json({ created, skipped });
  } catch (err) {
    console.error("POST /api/admin/session/[id]/candidates/import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/session/[id]/candidates/route.ts app/api/admin/session/[id]/candidates/import/route.ts
git commit -m "feat: session candidates API — GET list, POST add single, POST CSV import"
```

---

## Task 4: Update Questions API to Accept sessionId

**Files:**
- Modify: `app/api/admin/questions/route.ts`

**Interfaces:**
- Consumes: `?sessionId=` query param (optional, falls back to `findFirst`)
- Produces: same shape as before — `{ questions: Question[] }` / `{ question: Question }`

- [ ] **Step 1: Update `GET` and `POST` in `app/api/admin/questions/route.ts`**

```typescript
// app/api/admin/questions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveSessionId(sessionId?: string | null): Promise<string | null> {
  if (sessionId) return sessionId;
  const session = await prisma.session.findFirst({ orderBy: { createdAt: "desc" } });
  return session?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sid = await resolveSessionId(searchParams.get("sessionId"));
    if (!sid) return NextResponse.json({ questions: [] });

    const questions = await prisma.question.findMany({
      where: { sessionId: sid },
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("GET /api/admin/questions error:", err);
    return NextResponse.json({ error: "Failed to load questions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId: bodySessionId, type, text, imageUrl, options, correctOption, timeLimitSec, basePoints, speedBonusMax } = body;

    if (!type || !text || !timeLimitSec || basePoints == null) {
      return NextResponse.json({ error: "type, text, timeLimitSec, basePoints are required" }, { status: 400 });
    }

    const sid = await resolveSessionId(bodySessionId);
    if (!sid) {
      return NextResponse.json({ error: "No session found" }, { status: 404 });
    }

    const lastQuestion = await prisma.question.findFirst({
      where: { sessionId: sid },
      orderBy: { orderIndex: "desc" },
    });
    const nextIndex = lastQuestion ? lastQuestion.orderIndex + 1 : 0;

    const question = await prisma.question.create({
      data: {
        sessionId: sid,
        type,
        text,
        imageUrl: imageUrl || null,
        options: options ?? [],
        correctOption: correctOption ?? null,
        timeLimitSec: Number(timeLimitSec),
        basePoints: Number(basePoints),
        speedBonusMax: Number(speedBonusMax ?? 0),
        orderIndex: nextIndex,
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/questions error:", err);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/questions/route.ts
git commit -m "feat: questions API now accepts optional sessionId query/body param"
```

---

## Task 5: Scheduling Cron Route + vercel.json

**Files:**
- Create: `app/api/cron/session-scheduler/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `prisma.session` where `status = SCHEDULED` and `scheduledAt <= now()`
- Produces: transitions sessions to `LIVE` (autoStart) or `WAITING` (manual), no response body needed

- [ ] **Step 1: Create `app/api/cron/session-scheduler/route.ts`**

```typescript
// app/api/cron/session-scheduler/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SessionStatus } from "@prisma/client";

export async function GET() {
  try {
    const now = new Date();

    const due = await prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
    });

    const results: { id: string; newStatus: SessionStatus }[] = [];

    for (const session of due) {
      const newStatus = session.autoStart ? SessionStatus.LIVE : SessionStatus.WAITING;
      await prisma.session.update({
        where: { id: session.id },
        data: {
          status: newStatus,
          ...(session.autoStart ? { startedAt: now } : {}),
        },
      });
      results.push({ id: session.id, newStatus });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    console.error("Cron session-scheduler error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/session-scheduler",
      "schedule": "* * * * *"
    }
  ]
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/session-scheduler/route.ts vercel.json
git commit -m "feat: add session-scheduler cron route and vercel.json cron config"
```

---

## Task 6: Public Join Route

**Files:**
- Create: `app/join/[token]/page.tsx`

**Interfaces:**
- Consumes: `prisma.session.findUnique({ where: { joinToken: token } })` on the server
- Produces: redirects to `/candidate/login?token=[token]` or renders closed/invalid message

- [ ] **Step 1: Create `app/join/[token]/page.tsx`**

```typescript
// app/join/[token]/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await prisma.session.findUnique({
    where: { joinToken: token },
    select: { status: true, title: true },
  });

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#0F172A]">Invalid link</p>
          <p className="mt-2 text-sm text-[#64748B]">This join link does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  if (session.status === "ENDED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#0F172A]">{session.title}</p>
          <p className="mt-2 text-sm text-[#64748B]">This session has ended. No further logins are accepted.</p>
        </div>
      </div>
    );
  }

  redirect(`/candidate/login?token=${token}`);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

Visit `/join/nonexistent` — should show "Invalid link". Create a session via the API, visit `/join/[joinToken]` — should redirect to `/candidate/login?token=[joinToken]`.

- [ ] **Step 4: Commit**

```bash
git add app/join/[token]/page.tsx
git commit -m "feat: add public /join/[token] route with status-aware redirect"
```

---

## Task 7: Update Auth — Scope Login to Session + Duplicate Detection

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/verify-otp/route.ts`
- Modify: `app/candidate/login/page.tsx`

**Interfaces:**
- Consumes: `joinToken` query param from candidate login page; `candidate.activeToken` for duplicate check
- Produces: login scoped to session; duplicate disqualifies both and returns 409

- [ ] **Step 1: Update `app/api/auth/login/route.ts`**

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, email, password, joinToken } = await req.json();

    if (!rollNumber || !email || !password) {
      return NextResponse.json(
        { message: "rollNumber, email and password are required" },
        { status: 400 }
      );
    }

    // If joinToken provided, scope lookup to that session
    let candidate;
    if (joinToken) {
      const session = await prisma.session.findUnique({
        where: { joinToken },
        select: { id: true },
      });
      if (!session) {
        return NextResponse.json({ message: "Invalid session link" }, { status: 401 });
      }
      candidate = await prisma.candidate.findFirst({
        where: { rollNumber, email, sessionId: session.id },
      });
    } else {
      candidate = await prisma.candidate.findFirst({
        where: { rollNumber, email },
      });
    }

    if (!candidate) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const passwordMatches = await bcrypt.compare(password, candidate.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { otpCode: "123456", otpExpiresAt },
    });

    return NextResponse.json({ message: "OTP sent" }, { status: 200 });
  } catch (err) {
    console.error("login error:", err);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update `app/api/auth/verify-otp/route.ts`**

```typescript
// app/api/auth/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CandidateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { rollNumber, otp } = await req.json();

    if (!rollNumber || !otp) {
      return NextResponse.json(
        { message: "rollNumber and otp are required" },
        { status: 400 }
      );
    }

    const candidate = await prisma.candidate.findUnique({
      where: { rollNumber },
    });

    if (!candidate || !candidate.otpCode || !candidate.otpExpiresAt) {
      return NextResponse.json({ message: "Invalid or expired OTP" }, { status: 401 });
    }

    const isMatch = candidate.otpCode === otp;
    const isExpired = candidate.otpExpiresAt.getTime() < Date.now();

    if (!isMatch || isExpired) {
      return NextResponse.json({ message: "Invalid or expired OTP" }, { status: 401 });
    }

    // Duplicate login detection: if activeToken already set, disqualify both
    if (candidate.activeToken) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.DISQUALIFIED,
          activeToken: null,
          otpCode: null,
          otpExpiresAt: null,
          disqualifyReason: "Duplicate login detected — credentials used on multiple devices",
        },
      });
      return NextResponse.json(
        {
          message:
            "Your credentials have been used on another device — both attempts have been disqualified.",
        },
        { status: 409 }
      );
    }

    const newActiveToken = randomUUID();

    const updated = await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        status: CandidateStatus.JOINED,
        activeToken: newActiveToken,
      },
    });

    const token = signToken(updated.id, updated.rollNumber);

    return NextResponse.json(
      {
        token,
        name: updated.name,
        rollNumber: updated.rollNumber,
        activeToken: newActiveToken,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Update `app/candidate/login/page.tsx` to read `?token=` and pass to API**

Find the `handleSubmit` function and the fetch call in `app/candidate/login/page.tsx`. Replace the component with:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBranding } from "@/lib/use-branding";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useBranding();
  const joinToken = searchParams.get("token") ?? "";

  const [rollNumber, setRollNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!rollNumber || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber, email, password, joinToken: joinToken || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        setIsLoading(false);
        return;
      }

      sessionStorage.setItem("rollNumber", rollNumber);
      if (joinToken) sessionStorage.setItem("joinToken", joinToken);
      router.push("/candidate/verify-otp");
    } catch (err) {
      console.error("login submit error:", err);
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2E0BFC] focus:bg-white focus:ring-1 focus:ring-[#2E0BFC]";

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div
          className="mb-6 overflow-hidden rounded-2xl text-center"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
        >
          <div className="px-6 py-7">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.orgName}
                className="mx-auto mb-2 h-8 max-w-[180px] object-contain"
              />
            ) : (
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <span className="text-lg font-bold text-white">{branding.orgName.charAt(0)}</span>
              </div>
            )}
            <h1 className="text-lg font-bold text-white">{branding.orgName}</h1>
            <p className="mt-0.5 text-sm text-white/70">{branding.tagline}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-[#0F172A]">Candidate sign in</h2>
          <p className="mb-5 text-xs text-[#64748B]">Enter your credentials to access the assessment.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Roll Number</label>
              <input type="text" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className={inputCls} placeholder="e.g. PC-2026-001" autoComplete="off" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" autoComplete="off" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#0F172A]">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" autoComplete="current-password" />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
            >
              {isLoading ? "Sending OTP..." : "Continue →"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-[#94A3B8]">Assessment platform by {branding.orgName}</p>
      </div>
    </div>
  );
}

export default function CandidateLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Smoke test**

1. Start dev server. Visit `/candidate/login` — login form should work as before (no regression).
2. Create a session via API, get its `joinToken`, visit `/join/[joinToken]` → should redirect to `/candidate/login?token=[joinToken]`. The `joinToken` should now be in `sessionStorage` after login.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/verify-otp/route.ts app/candidate/login/page.tsx
git commit -m "feat: scope candidate auth to session joinToken; add duplicate login disqualification via activeToken"
```

---

## Task 8: Admin Session List Page

**Files:**
- Rewrite: `app/admin/session/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/session` → `{ sessions: { id, title, status, scheduledAt, joinToken, _count: { candidates, questions } }[] }`
- Produces: session list UI with copy join link, status badges, New Session button linking to `/admin/session/new`

- [ ] **Step 1: Rewrite `app/admin/session/page.tsx`**

```typescript
// app/admin/session/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SessionStatus = "SCHEDULED" | "WAITING" | "LIVE" | "PAUSED" | "ENDED";

interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  joinToken: string;
  scheduledAt: string | null;
  autoStart: boolean;
  createdAt: string;
  _count: { candidates: number; questions: number };
}

const STATUS_STYLES: Record<SessionStatus, { label: string; badge: string; dot: string }> = {
  SCHEDULED: { label: "Scheduled", badge: "bg-blue-50 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  WAITING:   { label: "Waiting",   badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  LIVE:      { label: "Live",      badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  PAUSED:    { label: "Paused",    badge: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  ENDED:     { label: "Ended",     badge: "bg-red-50 text-red-700 border-red-200",         dot: "bg-red-500" },
};

export default function AdminSessionListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/admin/session");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  function copyLink(joinToken: string) {
    const url = `${window.location.origin}/join/${joinToken}`;
    navigator.clipboard.writeText(url);
    setCopied(joinToken);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="px-7 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Sessions</h1>
          <p className="text-sm text-[#64748B]">Create and manage assessment sessions.</p>
        </div>
        <Link
          href="/admin/session/new"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}
        >
          + New Session
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-[#64748B]">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-white py-20 text-center">
          <p className="font-medium text-[#0F172A]">No sessions yet</p>
          <p className="mt-1 text-sm text-[#64748B]">Create your first session to get started.</p>
          <Link
            href="/admin/session/new"
            className="mt-5 rounded-lg bg-[#2E0BFC] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1E06B8]"
          >
            New Session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const st = STATUS_STYLES[s.status];
            return (
              <div key={s.id} className="flex items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <span className="truncate font-semibold text-[#0F172A]">{s.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-[#64748B]">
                    <span>{s._count.candidates} candidates</span>
                    <span>{s._count.questions} questions</span>
                    {s.scheduledAt && (
                      <span>Scheduled: {new Date(s.scheduledAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(s.joinToken)}
                    className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] transition"
                  >
                    {copied === s.joinToken ? "Copied!" : "Copy link"}
                  </button>
                  <Link
                    href={`/admin/session/${s.id}`}
                    className="rounded-lg bg-[#2E0BFC] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition"
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

Visit `/admin/session` in the browser. Should show a list of sessions (or empty state). "Copy link" should copy the join URL to clipboard.

- [ ] **Step 4: Commit**

```bash
git add app/admin/session/page.tsx
git commit -m "feat: replace session page with multi-session list UI"
```

---

## Task 9: Session Creation Wizard

**Files:**
- Create: `app/admin/session/new/page.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/admin/session` → creates session, returns `{ session: { id, joinToken } }`
  - `POST /api/admin/session/[id]/candidates/import` → `{ rows }` → `{ created, skipped }`
  - `POST /api/admin/session/[id]/candidates` → `{ name, rollNumber, email }` → `{ candidate, password }`
- Produces: 3-step wizard UI (Setup → Candidates → Questions); on completion navigates to `/admin/session/[id]`

- [ ] **Step 1: Create `app/admin/session/new/page.tsx`**

```typescript
// app/admin/session/new/page.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = 1 | 2 | 3;

interface CreatedSession {
  id: string;
  joinToken: string;
  title: string;
}

interface ImportedCandidate {
  rollNumber: string;
  name: string;
  email: string;
  password: string;
}

function parseCSV(text: string): { name: string; rollNumber: string; email: string }[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  const rollIdx = headers.indexOf("rollnumber");
  const emailIdx = headers.indexOf("email");
  if (nameIdx === -1 || rollIdx === -1 || emailIdx === -1) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return { name: cols[nameIdx] ?? "", rollNumber: cols[rollIdx] ?? "", email: cols[emailIdx] ?? "" };
  }).filter((r) => r.name && r.rollNumber && r.email);
}

export default function NewSessionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [session, setSession] = useState<CreatedSession | null>(null);

  // Step 1 state
  const [title, setTitle] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"manual" | "scheduled">("manual");
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [step1Busy, setStep1Busy] = useState(false);
  const [step1Error, setStep1Error] = useState("");

  // Step 2 state
  const [candidateTab, setCandidateTab] = useState<"csv" | "manual">("csv");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: ImportedCandidate[]; skipped: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualRoll, setManualRoll] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualAdded, setManualAdded] = useState<ImportedCandidate[]>([]);
  const [manualError, setManualError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setStep1Error("");
    if (!title.trim()) { setStep1Error("Title is required"); return; }
    setStep1Busy(true);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        scheduledAt: scheduleMode === "scheduled" && scheduledAt ? scheduledAt : null,
        autoStart: scheduleMode === "scheduled" ? autoStart : false,
      }),
    });
    const data = await res.json();
    setStep1Busy(false);
    if (!res.ok) { setStep1Error(data.error || "Failed to create session"); return; }
    setSession(data.session);
    setStep(2);
  }

  async function handleCSVImport() {
    if (!csvFile || !session) return;
    setImportError("");
    setCsvBusy(true);
    const text = await csvFile.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      setImportError("CSV must have columns: name, rollNumber, email (with header row)");
      setCsvBusy(false);
      return;
    }
    const res = await fetch(`/api/admin/session/${session.id}/candidates/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    setCsvBusy(false);
    if (!res.ok) {
      setImportError(data.error || "Import failed");
      return;
    }
    setImportResult(data);
  }

  function downloadCredentials(candidates: ImportedCandidate[]) {
    const header = "name,rollNumber,email,password\n";
    const rows = candidates.map((c) => `${c.name},${c.rollNumber},${c.email},${c.password}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credentials-${session?.title ?? "session"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setManualError("");
    if (!manualName.trim() || !manualRoll.trim() || !manualEmail.trim()) {
      setManualError("All fields are required");
      return;
    }
    if (!session) return;
    setManualBusy(true);
    const res = await fetch(`/api/admin/session/${session.id}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: manualName.trim(), rollNumber: manualRoll.trim(), email: manualEmail.trim() }),
    });
    const data = await res.json();
    setManualBusy(false);
    if (!res.ok) { setManualError(data.error || "Failed to add candidate"); return; }
    setManualAdded((prev) => [...prev, { rollNumber: data.candidate.rollNumber, name: data.candidate.name, email: data.candidate.email, password: data.password }]);
    setManualName(""); setManualRoll(""); setManualEmail("");
  }

  const inputCls = "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]";

  return (
    <div className="px-7 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/session" className="text-sm text-[#64748B] hover:text-[#0F172A]">← Sessions</Link>
        <span className="text-[#CBD5E1]">/</span>
        <h1 className="text-xl font-bold text-[#0F172A]">New Session</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= n ? "bg-[#2E0BFC] text-white" : "bg-[#F1F5F9] text-[#94A3B8]"}`}>{n}</div>
            <span className={`text-sm ${step >= n ? "font-medium text-[#0F172A]" : "text-[#94A3B8]"}`}>{["Setup", "Candidates", "Questions"][n - 1]}</span>
            {n < 3 && <span className="mx-2 text-[#CBD5E1]">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Setup */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="max-w-lg space-y-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#0F172A]">Session title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Batch A – June 2026" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-[#0F172A]">Start mode</label>
            <div className="flex gap-2">
              {(["manual", "scheduled"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setScheduleMode(m)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${scheduleMode === m ? "border-[#2E0BFC] bg-[#EEF2FF] text-[#2E0BFC]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}>
                  {m === "manual" ? "Manual start" : "Scheduled"}
                </button>
              ))}
            </div>
          </div>
          {scheduleMode === "scheduled" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#0F172A]">Date & time</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputCls} />
              </div>
              <div className="flex items-center gap-3">
                <input id="autoStart" type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="h-4 w-4 rounded border-[#E2E8F0] accent-[#2E0BFC]" />
                <label htmlFor="autoStart" className="text-sm text-[#0F172A]">Auto-start at scheduled time</label>
              </div>
              {!autoStart && (
                <p className="text-xs text-[#64748B]">At the scheduled time, the Start button will unlock — you still need to click it to go live.</p>
              )}
            </>
          )}
          {step1Error && <p className="text-xs text-red-600">{step1Error}</p>}
          <button type="submit" disabled={step1Busy}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
            {step1Busy ? "Creating…" : "Continue →"}
          </button>
        </form>
      )}

      {/* Step 2: Candidates */}
      {step === 2 && session && (
        <div className="max-w-2xl">
          {/* Join link */}
          <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-[#64748B]">Join link</p>
              <p className="text-sm font-mono text-[#0F172A] mt-0.5">{typeof window !== "undefined" ? `${window.location.origin}/join/${session.joinToken}` : `/join/${session.joinToken}`}</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${session.joinToken}`)}
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9]">
              Copy
            </button>
          </div>

          {/* Sub-tabs */}
          <div className="mb-5 flex gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1 w-fit">
            {(["csv", "manual"] as const).map((t) => (
              <button key={t} onClick={() => setCandidateTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${candidateTab === t ? "bg-white text-[#0F172A] shadow-sm" : "text-[#64748B] hover:text-[#0F172A]"}`}>
                {t === "csv" ? "CSV Upload" : "Add Manually"}
              </button>
            ))}
          </div>

          {candidateTab === "csv" && (
            <div className="space-y-4">
              <p className="text-xs text-[#64748B]">CSV must have a header row with columns: <code className="bg-[#F1F5F9] px-1 rounded">name, rollNumber, email</code>. Passwords are auto-generated.</p>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="text-sm text-[#64748B]" />
              {csvFile && !importResult && (
                <button onClick={handleCSVImport} disabled={csvBusy}
                  className="rounded-lg bg-[#2E0BFC] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {csvBusy ? "Importing…" : "Import CSV"}
                </button>
              )}
              {importError && <p className="text-xs text-red-600">{importError}</p>}
              {importResult && (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 space-y-3">
                  <p className="text-sm font-semibold text-[#0F172A]">{importResult.created.length} imported{importResult.skipped.length > 0 ? `, ${importResult.skipped.length} skipped` : ""}</p>
                  {importResult.skipped.length > 0 && (
                    <ul className="text-xs text-amber-700 space-y-0.5">{importResult.skipped.map((s, i) => <li key={i}>• {s}</li>)}</ul>
                  )}
                  <button onClick={() => downloadCredentials(importResult.created)}
                    className="rounded-lg border border-[#2E0BFC] px-4 py-2 text-sm font-semibold text-[#2E0BFC] hover:bg-[#EEF2FF]">
                    Download credential sheet
                  </button>
                </div>
              )}
            </div>
          )}

          {candidateTab === "manual" && (
            <div className="space-y-4">
              <form onSubmit={handleManualAdd} className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Name</label>
                  <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} className={inputCls} placeholder="Full name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Roll Number</label>
                  <input type="text" value={manualRoll} onChange={(e) => setManualRoll(e.target.value)} className={inputCls} placeholder="e.g. PC-0001" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#0F172A]">Email</label>
                  <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
                </div>
                <div className="col-span-3">
                  {manualError && <p className="mb-2 text-xs text-red-600">{manualError}</p>}
                  <button type="submit" disabled={manualBusy}
                    className="rounded-lg bg-[#2E0BFC] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {manualBusy ? "Adding…" : "Add Candidate"}
                  </button>
                </div>
              </form>
              {manualAdded.length > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[#0F172A]">{manualAdded.length} added this session</p>
                    <button onClick={() => downloadCredentials(manualAdded)}
                      className="rounded-lg border border-[#2E0BFC] px-3 py-1 text-xs font-semibold text-[#2E0BFC] hover:bg-[#EEF2FF]">
                      Download credentials
                    </button>
                  </div>
                  <div className="space-y-1">
                    {manualAdded.map((c) => (
                      <div key={c.rollNumber} className="flex gap-3 text-xs text-[#64748B]">
                        <span className="font-mono">{c.rollNumber}</span>
                        <span>{c.name}</span>
                        <span>{c.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button onClick={() => setStep(3)}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
              Continue to Questions →
            </button>
            <button onClick={() => router.push(`/admin/session/${session.id}`)}
              className="rounded-lg border border-[#E2E8F0] px-5 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]">
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Questions */}
      {step === 3 && session && (
        <div className="max-w-2xl">
          <p className="mb-4 text-sm text-[#64748B]">
            Questions for this session are managed on the Questions page, scoped to this session.
          </p>
          <div className="flex gap-3">
            <a
              href={`/admin/questions?sessionId=${session.id}`}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}
            >
              Open Question Builder →
            </a>
            <button onClick={() => router.push(`/admin/session/${session.id}`)}
              className="rounded-lg border border-[#E2E8F0] px-5 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]">
              Go to Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

1. Visit `/admin/session/new`.
2. Fill Step 1 (title + manual start) → click Continue. Should advance to Step 2.
3. On Step 2, upload a CSV with header `name,rollNumber,email` and a few rows → click Import. Should show imported count and a Download button.
4. Click "Continue to Questions" → Step 3 with link to question builder.

- [ ] **Step 4: Commit**

```bash
git add app/admin/session/new/page.tsx
git commit -m "feat: add 3-step session creation wizard (setup, candidates, questions)"
```

---

## Task 10: Session Detail / Live Control Page

**Files:**
- Create: `app/admin/session/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/admin/session/[id]` → `{ session: { id, title, status, joinToken, scheduledAt, autoStart, candidates[], _count } }`
  - `PATCH /api/admin/session/[id]` with `{ action: "start" | "pause" | "end" | "unlock" }` → `{ status }`
  - `POST /api/admin/session/[id]/candidates` → `{ candidate, password }`
  - `GET /api/admin/session` (socket `admin:broadcast` via existing `getAdminSocket`)
- Produces: session detail UI with join link, candidate list, live control buttons, manual-add form, broadcast panel

- [ ] **Step 1: Create `app/admin/session/[id]/page.tsx`**

```typescript
// app/admin/session/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAdminSocket } from "@/lib/admin-socket-client";

type SessionStatus = "SCHEDULED" | "WAITING" | "LIVE" | "PAUSED" | "ENDED";
type CandidateStatus = "REGISTERED" | "JOINED" | "ACTIVE" | "COMPLETED" | "DISQUALIFIED";

interface Candidate {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  status: CandidateStatus;
  tabSwitchCount: number;
  disqualifyReason: string | null;
}

interface SessionDetail {
  id: string;
  title: string;
  status: SessionStatus;
  joinToken: string;
  scheduledAt: string | null;
  autoStart: boolean;
  candidates: Candidate[];
  _count: { questions: number };
}

const STATUS_STYLES: Record<SessionStatus, { label: string; badge: string; dot: string }> = {
  SCHEDULED: { label: "Scheduled", badge: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  WAITING:   { label: "Waiting",   badge: "bg-slate-100 text-slate-600 border-slate-200",   dot: "bg-slate-400" },
  LIVE:      { label: "Live",      badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  PAUSED:    { label: "Paused",    badge: "bg-amber-50 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  ENDED:     { label: "Ended",     badge: "bg-red-50 text-red-700 border-red-200",           dot: "bg-red-500" },
};

const CANDIDATE_STATUS_STYLES: Record<CandidateStatus, string> = {
  REGISTERED:   "bg-slate-100 text-slate-600",
  JOINED:       "bg-blue-50 text-blue-700",
  ACTIVE:       "bg-emerald-50 text-emerald-700",
  COMPLETED:    "bg-indigo-50 text-indigo-700",
  DISQUALIFIED: "bg-red-50 text-red-700",
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broadcast, setBroadcast] = useState("");
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  // Manual add candidate
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRoll, setAddRoll] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [newCredential, setNewCredential] = useState<{ rollNumber: string; password: string } | null>(null);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/admin/session/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSession(data.session);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchSession();
    getAdminSocket().emit("admin:join");
  }, [fetchSession]);

  async function runAction(action: "start" | "pause" | "end" | "unlock") {
    if (!session) return;
    setBusy(true);
    const res = await fetch(`/api/admin/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setSession((prev) => prev ? { ...prev, status: data.status } : prev);
      const socket = getAdminSocket();
      if (action === "start") socket.emit("session:start");
      if (action === "end") socket.emit("session:end");
    }
  }

  function sendBroadcast() {
    const trimmed = broadcast.trim();
    if (!trimmed) return;
    getAdminSocket().emit("admin:broadcast", { message: trimmed });
    setSentMsg(`Sent: "${trimmed}"`);
    setBroadcast("");
  }

  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!addName.trim() || !addRoll.trim() || !addEmail.trim()) {
      setAddError("All fields required");
      return;
    }
    setAddBusy(true);
    const res = await fetch(`/api/admin/session/${id}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName.trim(), rollNumber: addRoll.trim(), email: addEmail.trim() }),
    });
    const data = await res.json();
    setAddBusy(false);
    if (!res.ok) { setAddError(data.error || "Failed"); return; }
    setNewCredential({ rollNumber: data.candidate.rollNumber, password: data.password });
    setSession((prev) => prev ? { ...prev, candidates: [...prev.candidates, data.candidate] } : prev);
    setAddName(""); setAddRoll(""); setAddEmail("");
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/join/${session!.joinToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputCls = "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2E0BFC] focus:ring-1 focus:ring-[#2E0BFC]";

  if (loading) return <div className="px-7 py-6 text-sm text-[#64748B]">Loading…</div>;
  if (!session) return <div className="px-7 py-6 text-sm text-red-600">Session not found.</div>;

  const st = STATUS_STYLES[session.status];

  return (
    <div className="px-7 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/session" className="text-sm text-[#64748B] hover:text-[#0F172A]">← Sessions</Link>
          <span className="text-[#CBD5E1]">/</span>
          <h1 className="text-xl font-bold text-[#0F172A]">{session.title}</h1>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        </div>
        <a href={`/admin/questions?sessionId=${session.id}`} className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC]">
          Questions ({session._count.questions}) →
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Join link */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#64748B]">Join link</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 truncate rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm font-mono text-[#0F172A]">
                {typeof window !== "undefined" ? `${window.location.origin}/join/${session.joinToken}` : `/join/${session.joinToken}`}
              </code>
              <button onClick={copyLink} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] shrink-0">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Candidates */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#0F172A]">Candidates ({session.candidates.length})</p>
              <button onClick={() => setShowAddForm((v) => !v)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC]">
                + Add manually
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddCandidate} className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-4">
                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} className={inputCls} placeholder="Full name" />
                <input type="text" value={addRoll} onChange={(e) => setAddRoll(e.target.value)} className={inputCls} placeholder="Roll number" />
                <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} className={inputCls} placeholder="Email" />
                <div className="col-span-3 flex items-center gap-2">
                  {addError && <p className="text-xs text-red-600">{addError}</p>}
                  <button type="submit" disabled={addBusy} className="rounded-lg bg-[#2E0BFC] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {addBusy ? "Adding…" : "Add"}
                  </button>
                </div>
              </form>
            )}

            {newCredential && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-800">Candidate added — save these credentials:</p>
                <p className="mt-1 text-xs font-mono text-emerald-700">Roll: {newCredential.rollNumber} · Password: {newCredential.password}</p>
                <button onClick={() => setNewCredential(null)} className="mt-2 text-xs text-emerald-600 underline">Dismiss</button>
              </div>
            )}

            {session.candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#94A3B8]">No candidates yet.</p>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {session.candidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CANDIDATE_STATUS_STYLES[c.status]}`}>{c.status}</span>
                    <span className="font-mono text-xs text-[#64748B]">{c.rollNumber}</span>
                    <span className="text-sm text-[#0F172A]">{c.name}</span>
                    <span className="text-xs text-[#94A3B8]">{c.email}</span>
                    {c.tabSwitchCount > 0 && (
                      <span className="ml-auto text-xs text-amber-600">{c.tabSwitchCount} tab switches</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: live controls + broadcast */}
        <div className="space-y-6">
          {/* Live controls */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-[#64748B]">Session control</p>
            <div className="flex flex-col gap-2">
              {session.status === "WAITING" && (
                <button onClick={() => runAction("start")} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Start Session"}
                </button>
              )}
              {session.status === "SCHEDULED" && (
                <button onClick={() => runAction("unlock")} disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Unlock Early"}
                </button>
              )}
              {session.status === "LIVE" && (
                <button onClick={() => runAction("pause")} disabled={busy}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Pause Session"}
                </button>
              )}
              {session.status === "PAUSED" && (
                <button onClick={() => runAction("start")} disabled={busy}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
                  {busy ? "Working…" : "Resume Session"}
                </button>
              )}
              {(session.status === "LIVE" || session.status === "PAUSED") && (
                <button onClick={() => runAction("end")} disabled={busy}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition">
                  {busy ? "Working…" : "End Session"}
                </button>
              )}
              {session.status === "ENDED" && (
                <p className="text-center text-xs text-[#94A3B8]">Session has ended.</p>
              )}
            </div>
            {session.scheduledAt && (
              <p className="mt-3 text-xs text-[#64748B]">
                Scheduled: {new Date(session.scheduledAt).toLocaleString()}
                {session.autoStart ? " (auto-start)" : " (manual start)"}
              </p>
            )}
          </div>

          {/* Broadcast */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-[#0F172A]">Broadcast</p>
            <p className="mb-3 text-xs text-[#64748B]">Appears as a toast on all candidate screens.</p>
            <div className="flex gap-2">
              <input
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
                placeholder="Type a message…"
                className={inputCls}
              />
              <button onClick={sendBroadcast}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white shrink-0"
                style={{ background: "linear-gradient(115deg, #2E0BFC 0%, #6366F1 100%)" }}>
                Send
              </button>
            </div>
            {sentMsg && <p className="mt-2 text-xs text-[#64748B]">{sentMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

1. Create a session via the wizard, navigate to its detail page.
2. Confirm join link is visible and copy works.
3. Add a candidate manually — credential should appear.
4. Click "Start Session" — status badge should change to Live.
5. Click "End Session" — status badge should change to Ended.

- [ ] **Step 4: Commit**

```bash
git add app/admin/session/[id]/page.tsx
git commit -m "feat: add session detail page with live controls, candidate list, and broadcast panel"
```

---

## Task 11: Update Admin Dashboard Session Status Hydration

**Files:**
- Modify: `app/admin/page.tsx` (update the session fetch to work with multi-session model)

**Interfaces:**
- Consumes: `GET /api/admin/session` now returns `{ sessions: [] }` not `{ status }`
- Produces: dashboard shows status of the most recently active session

- [ ] **Step 1: Update the session fetch in `app/admin/page.tsx`**

Find the block added in the last commit that fetches `/api/admin/session`:

```typescript
// fetch once on mount to seed session status
fetch("/api/admin/session")
  .then((r) => r.ok ? r.json() : null)
  .then((data) => { if (data?.status) setSessionStatus(data.status); })
  .catch(() => {});
```

Replace it with:

```typescript
// fetch most recent session status for dashboard badge
fetch("/api/admin/session")
  .then((r) => r.ok ? r.json() : null)
  .then((data) => {
    const sessions: { status: string }[] = data?.sessions ?? [];
    const live = sessions.find((s) => s.status === "LIVE") ?? sessions.find((s) => s.status === "PAUSED") ?? sessions[0];
    if (live?.status) setSessionStatus(live.status as typeof sessionStatus);
  })
  .catch(() => {});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "fix: update admin dashboard session hydration to work with multi-session API"
```

---

## Task 12: Wire AdminSidebar Sessions Link

**Files:**
- Check: `components/admin/AdminSidebar.tsx` — confirm "Live Session" link points to `/admin/session` (no change needed if already correct; otherwise update href)

- [ ] **Step 1: Verify sidebar nav item**

Open `components/admin/AdminSidebar.tsx` and confirm the Live Session nav item href is `/admin/session`. It should already be correct. If it reads `/admin/session` — no change needed.

- [ ] **Step 2: Final full type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Final smoke test checklist**

- [ ] `/admin/session` shows session list with "New Session" button
- [ ] Create session via wizard (manual start) → lands on detail page
- [ ] Create session via wizard (scheduled, auto-start) → status shows SCHEDULED
- [ ] Copy join link → visit `/join/[token]` → redirects to candidate login
- [ ] Candidate login with valid credentials scoped to session → OTP flow works
- [ ] Second login with same credentials after OTP verified → 409 disqualified message
- [ ] Visit `/join/expired-token` → shows "Invalid link"
- [ ] End a session → visit its join link → shows "This session has ended"

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete session system redesign — join links, scheduling, CSV import, duplicate detection"
```
