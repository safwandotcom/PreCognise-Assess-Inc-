# Phase 1 + 2: Security & Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down admin routes with Clerk auth, remove the candidate test-bypass button, and add transactional email (credentials on import + OTP-based password recovery).

**Architecture:** Clerk middleware gates all `/admin/**` and `/api/admin/**` routes — ClerkProvider is already in the root layout. A typed `lib/email.ts` module wraps the Resend SDK and exports three send functions. OTP recovery adds two nullable fields to `Candidate` and two new API routes. A new forgot-password page implements the two-step UI.

**Tech Stack:** Next.js 16, Clerk (`@clerk/nextjs` already installed), Resend SDK (`resend` — to install), Prisma 6 / Neon PostgreSQL, bcryptjs (already installed), TypeScript

## Global Constraints

- Node target: existing project config — do not add new tsconfig entries
- All new API routes follow the existing pattern: `NextRequest` → `NextResponse.json()`
- Prisma client: import from `@/lib/prisma`
- bcrypt: import from `bcryptjs` (not `bcrypt`)
- No new UI component libraries — Tailwind only, matching existing colour tokens (`#0F172A`, `#64748B`, `#94A3B8`, `#E2E8F0`, `#F8FAFC`, `#6366F1`)
- New pages must wrap any `useSearchParams()` usage in `<Suspense>` (Next.js 16 requirement)
- Passwords: minimum 8 characters, enforced server-side in verify-otp
- OTP: 6 digits, 15-minute expiry, bcrypt-hashed at cost 10, single-use

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `middleware.ts` | Clerk route protection |
| Modify | `app/candidate/waiting-room/page.tsx` | Remove test button |
| Create | `lib/email.ts` | Resend wrapper — three typed send functions |
| Modify | `lib/campaign-utils.ts` | Add `formatExamDate` helper |
| Modify | `prisma/schema.prisma` | Add `otpHash`, `otpExpiresAt` to Candidate |
| Modify | `app/api/admin/campaigns/[id]/candidates/import/route.ts` | Fire credential emails after insert |
| Create | `app/api/auth/forgot-password/route.ts` | Generate + store OTP, send OTP email |
| Create | `app/api/auth/verify-otp/route.ts` | Validate OTP, update password |
| Create | `app/candidate/forgot-password/page.tsx` | Two-step reset UI |
| Modify | `app/candidate/login/page.tsx` | Add "Forgot password?" link |

---

## Task 1: Clerk Middleware

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Produces: all `/admin/**` and `/api/admin/**` routes require an active Clerk session; everything else is public

- [ ] **Step 1: Replace middleware.ts**

Open `middleware.ts` and replace the entire file with:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

- [ ] **Step 2: Verify env vars are documented**

Confirm `.env.local` has (or add placeholders):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

`ClerkProvider` is already wrapping the root layout in `app/layout.tsx` — no changes needed there.

- [ ] **Step 3: Verify locally**

```bash
npm run dev
```

Open `http://localhost:3000/admin` in an incognito window. Expected: redirected to Clerk's hosted sign-in page.  
Open `http://localhost:3000/candidate/login` — should load normally (public route).

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat: enforce Clerk auth on all /admin routes"
```

---

## Task 2: Remove Test Button from Waiting Room

**Files:**
- Modify: `app/candidate/waiting-room/page.tsx`

**Interfaces:**
- Produces: only `SESSION_START` socket event can advance candidates to the exam

- [ ] **Step 1: Delete the test button block**

In `app/candidate/waiting-room/page.tsx`, delete lines 156–164 (the entire `{/* Test button */}` div):

```tsx
// DELETE this block entirely:
        {/* Test button */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.replace("/candidate/exam")}
            className="text-xs text-[#94A3B8] underline-offset-2 hover:text-[#64748B] hover:underline"
          >
            Continue to exam (test only)
          </button>
        </div>
```

The file should end with:

```tsx
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm run dev
```

Navigate to `/candidate/waiting-room`. The "Continue to exam (test only)" button must not appear.

- [ ] **Step 3: Commit**

```bash
git add app/candidate/waiting-room/page.tsx
git commit -m "fix: remove candidate test-bypass button from waiting room"
```

---

## Task 3: Resend Email Module

**Files:**
- Create: `lib/email.ts`
- Modify: `lib/campaign-utils.ts`

**Interfaces:**
- Produces:
  ```ts
  sendCredentials(opts: SendCredentialsOpts): Promise<void>
  sendOTP(opts: SendOTPOpts): Promise<void>
  sendPasswordChanged(opts: SendPasswordChangedOpts): Promise<void>
  formatExamDate(date: Date): string  // in lib/campaign-utils.ts
  ```

- [ ] **Step 1: Install Resend SDK**

```bash
npm install resend
```

Expected: `resend` appears in `package.json` dependencies.

- [ ] **Step 2: Add env vars to .env.local**

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

- [ ] **Step 3: Add `formatExamDate` to lib/campaign-utils.ts**

Append to the bottom of `lib/campaign-utils.ts`:

```ts
export function formatExamDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}
```

- [ ] **Step 4: Create lib/email.ts**

```ts
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) throw new Error("RESEND_API_KEY environment variable is not set");

const resend = new Resend(apiKey);
const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@example.com";

export interface SendCredentialsOpts {
  to: string;
  name: string;
  accessId: string;
  password: string;
  loginUrl: string;
  examDate?: string;
  orgName?: string;
}

export async function sendCredentials(opts: SendCredentialsOpts): Promise<void> {
  const { to, name, accessId, password, loginUrl, examDate, orgName = "PreCognise" } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <div style="background:linear-gradient(135deg,#6366F1 0%,#4F46E5 100%);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
    <h1 style="color:white;margin:0;font-size:20px;">${orgName}</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">Assessment Credentials</p>
  </div>
  <p style="margin:0 0 8px;">Hi ${name},</p>
  <p style="color:#64748B;margin:0 0 24px;font-size:14px;">Your registration is confirmed. Use the credentials below to log in on exam day.</p>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:24px;">
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;font-weight:500;text-transform:uppercase;">Access ID</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;letter-spacing:2px;">${accessId}</p>
    </div>
    <div>
      <p style="margin:0 0 4px;font-size:12px;color:#64748B;font-weight:500;text-transform:uppercase;">Temporary Password</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;letter-spacing:2px;">${password}</p>
    </div>
  </div>
  ${examDate ? `<p style="color:#64748B;font-size:14px;margin-bottom:16px;">Exam date: <strong>${examDate}</strong></p>` : ""}
  <div style="margin-bottom:24px;">
    <a href="${loginUrl}" style="display:inline-block;background:#6366F1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Log In to Exam →</a>
  </div>
  <p style="color:#94A3B8;font-size:12px;margin:0;">Save this email — your credentials are shown here only once.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: `Your ${orgName} Assessment Credentials`, html });
}

export interface SendOTPOpts {
  to: string;
  name: string;
  code: string;
}

export async function sendOTP(opts: SendOTPOpts): Promise<void> {
  const { to, name, code } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <h2 style="margin:0 0 8px;">Password Reset</h2>
  <p style="color:#64748B;margin:0 0 24px;font-size:14px;">Hi ${name}, use the code below to reset your password. It expires in 15 minutes.</p>
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
    <p style="margin:0 0 8px;font-size:12px;color:#64748B;text-transform:uppercase;">Your reset code</p>
    <p style="margin:0;font-family:monospace;font-size:40px;font-weight:700;letter-spacing:10px;">${code}</p>
  </div>
  <p style="color:#94A3B8;font-size:12px;margin:0;">If you did not request a password reset, ignore this email.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: "Your password reset code", html });
}

export interface SendPasswordChangedOpts {
  to: string;
  name: string;
}

export async function sendPasswordChanged(opts: SendPasswordChangedOpts): Promise<void> {
  const { to, name } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#0F172A;">
  <h2 style="margin:0 0 8px;">Password Updated</h2>
  <p style="color:#64748B;margin:0;font-size:14px;">Hi ${name}, your password has been successfully updated. You can now log in with your new password.</p>
</body></html>`;

  await resend.emails.send({ from: FROM, to, subject: "Your password has been updated", html });
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors in `lib/email.ts` or `lib/campaign-utils.ts`. (Build may fail on other unrelated issues — that's okay; focus on these two files.)

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/campaign-utils.ts package.json package-lock.json
git commit -m "feat: add Resend email module with credential, OTP, and password-changed templates"
```

---

## Task 4: OTP Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Candidate` model has `otpHash String?` and `otpExpiresAt DateTime?` fields

- [ ] **Step 1: Add fields to Candidate model in schema.prisma**

In `prisma/schema.prisma`, inside the `model Candidate { ... }` block, add after `tabSwitchCount`:

```prisma
  otpHash       String?
  otpExpiresAt  DateTime?
```

The full Candidate model should now look like:

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
  otpHash           String?
  otpExpiresAt      DateTime?
  campaignId        String
  campaign          Campaign        @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  responses         Response[]

  @@unique([accessId, campaignId])
  @@unique([email, campaignId])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-otp-fields
```

Expected output includes: `✔ Generated Prisma Client` and the migration file path.

- [ ] **Step 3: Verify**

```bash
npx prisma studio
```

Open `Candidate` table — confirm `otpHash` and `otpExpiresAt` columns exist (both nullable). Close studio.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add OTP fields to Candidate for password recovery"
```

---

## Task 5: Credential Emails on Import

**Files:**
- Modify: `app/api/admin/campaigns/[id]/candidates/import/route.ts`

**Interfaces:**
- Consumes: `sendCredentials` from `lib/email.ts`; `formatExamDate` from `lib/campaign-utils.ts`
- Produces: API response gains `emailFailures: string[]` field

- [ ] **Step 1: Update the import route**

Replace the entire `app/api/admin/campaigns/[id]/candidates/import/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePassword, hashPassword, makeAccessId, formatExamDate } from "@/lib/campaign-utils";
import { sendCredentials } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const rows: { name: string; email: string }[] = body.rows ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const emailsSeen = new Set<string>();
  const dupes: number[] = [];
  rows.forEach((r, i) => {
    const e = r.email?.trim().toLowerCase();
    if (emailsSeen.has(e)) dupes.push(i + 1);
    else emailsSeen.add(e);
  });
  if (dupes.length > 0) {
    return NextResponse.json({ error: `Duplicate emails at rows: ${dupes.join(", ")}` }, { status: 422 });
  }

  const existingCount = await prisma.candidate.count({ where: { campaignId: id } });

  if (campaign.maxCandidates && existingCount + rows.length > campaign.maxCandidates) {
    return NextResponse.json(
      { error: `Import would exceed maxCandidates (${campaign.maxCandidates}). Currently ${existingCount} candidates registered.` },
      { status: 422 }
    );
  }

  const emailList = rows.map((r) => r.email.trim().toLowerCase());
  const existingInDb = await prisma.candidate.findMany({
    where: { campaignId: id, email: { in: emailList } },
    select: { email: true },
  });
  if (existingInDb.length > 0) {
    return NextResponse.json(
      { error: `These emails are already registered: ${existingInDb.map((c) => c.email).join(", ")}` },
      { status: 422 }
    );
  }

  const BATCH = 100;
  const credentials: { name: string; email: string; accessId: string; password: string; passwordHash: string }[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const hashed = await Promise.all(
      slice.map(async (r, j) => {
        const seq = existingCount + i + j + 1;
        const accessId = makeAccessId(campaign.name, seq);
        const password = generatePassword();
        const passwordHash = await hashPassword(password);
        return { name: r.name.trim(), email: r.email.trim().toLowerCase(), accessId, password, passwordHash };
      })
    );
    credentials.push(...hashed);
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidate.createMany({
      data: credentials.map((c) => ({
        accessId: c.accessId,
        email: c.email,
        name: c.name,
        passwordHash: c.passwordHash,
        generatedPassword: c.password,
        campaignId: id,
      })),
    });
  });

  // Fetch org branding for email template
  const branding = await prisma.orgBranding.findFirst();
  const orgName = branding?.orgName ?? "PreCognise";
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/candidate/login`;
  const examDate = campaign.scheduledAt ? formatExamDate(campaign.scheduledAt) : undefined;

  const emailResults = await Promise.allSettled(
    credentials.map((c) =>
      sendCredentials({
        to: c.email,
        name: c.name,
        accessId: c.accessId,
        password: c.password,
        loginUrl,
        examDate,
        orgName,
      })
    )
  );

  const emailFailures = emailResults
    .map((r, i) => (r.status === "rejected" ? credentials[i].email : null))
    .filter((e): e is string => e !== null);

  return NextResponse.json(
    {
      imported: credentials.length,
      emailFailures,
      credentials: credentials.map((c) => ({ name: c.name, accessId: c.accessId, email: c.email, password: c.password })),
    },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Verify**

Start the dev server and import a 1-row CSV for a campaign via the admin UI (or via curl):

```bash
curl -X POST http://localhost:3000/api/admin/campaigns/<CAMPAIGN_ID>/candidates/import \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"name":"Test Candidate","email":"your-real-email@example.com"}]}'
```

Expected: `{"imported":1,"emailFailures":[],"credentials":[...]}` and an email arrives at `your-real-email@example.com`.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/campaigns/\[id\]/candidates/import/route.ts
git commit -m "feat: send credential emails to candidates on CSV import"
```

---

## Task 6: Forgot-Password API Routes

**Files:**
- Create: `app/api/auth/forgot-password/route.ts`
- Create: `app/api/auth/verify-otp/route.ts`

**Interfaces:**
- Consumes: `sendOTP`, `sendPasswordChanged` from `lib/email.ts`; `hashPassword` from `lib/campaign-utils.ts`
- Produces:
  - `POST /api/auth/forgot-password` body `{ email, joinToken }` → `{ ok: true }` (always, to prevent enumeration)
  - `POST /api/auth/verify-otp` body `{ email, joinToken, code, newPassword }` → `{ ok: true }` or `{ error: string }` (400)

- [ ] **Step 1: Create app/api/auth/forgot-password/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/campaign-utils";
import { sendOTP } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, joinToken } = await req.json();

    if (!email?.trim() || !joinToken?.trim()) {
      return NextResponse.json({ error: "email and joinToken are required" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { joinToken } });
    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 404 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: email.trim().toLowerCase(), campaignId: campaign.id },
    });

    // Return ok regardless of whether candidate exists — prevents email enumeration
    if (!candidate) {
      return NextResponse.json({ ok: true });
    }

    const rawCode = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await hashPassword(rawCode);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { otpHash, otpExpiresAt },
    });

    await sendOTP({ to: candidate.email, name: candidate.name, code: rawCode });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/forgot-password error:", err);
    return NextResponse.json({ error: "Failed to send reset code" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create app/api/auth/verify-otp/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { hashPassword } from "@/lib/campaign-utils";
import { sendPasswordChanged } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, joinToken, code, newPassword } = await req.json();

    if (!email?.trim() || !joinToken?.trim() || !code?.trim() || !newPassword?.trim()) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { joinToken } });
    if (!campaign) {
      return NextResponse.json({ error: "Invalid join link" }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: email.trim().toLowerCase(), campaignId: campaign.id },
    });

    if (!candidate || !candidate.otpHash || !candidate.otpExpiresAt) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    if (candidate.otpExpiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    const valid = await bcrypt.compare(code, candidate.otpHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { passwordHash, otpHash: null, otpExpiresAt: null },
    });

    await sendPasswordChanged({ to: candidate.email, name: candidate.name });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/verify-otp error:", err);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify forgot-password route**

With dev server running and a known candidate in the DB (email + joinToken from their campaign):

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"candidate@example.com","joinToken":"<CAMPAIGN_JOIN_TOKEN>"}'
```

Expected: `{"ok":true}` and an OTP email arrives at the candidate's inbox.

- [ ] **Step 4: Verify verify-otp route**

Use the 6-digit code from the email received in Step 3:

```bash
# With wrong code — should fail
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"candidate@example.com","joinToken":"<JOIN_TOKEN>","code":"000000","newPassword":"NewPass123"}'
# Expected: {"error":"Invalid or expired code"}

# With correct code from email
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"candidate@example.com","joinToken":"<JOIN_TOKEN>","code":"<CODE_FROM_EMAIL>","newPassword":"NewPass123"}'
# Expected: {"ok":true}
```

Verify in Prisma Studio that `otpHash` and `otpExpiresAt` are now `null` on the candidate row.  
Verify a password-changed email arrived.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/forgot-password/route.ts app/api/auth/verify-otp/route.ts
git commit -m "feat: add forgot-password and verify-otp API routes with bcrypt OTP and 15-min expiry"
```

---

## Task 7: Forgot-Password Page + Login Link

**Files:**
- Create: `app/candidate/forgot-password/page.tsx`
- Modify: `app/candidate/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/forgot-password`, `POST /api/auth/verify-otp`
- Consumes: `useBranding(joinToken)` from `@/lib/use-branding` (same pattern as login page)
- Produces: two-step reset UI at `/candidate/forgot-password?token=<joinToken>`

- [ ] **Step 1: Create app/candidate/forgot-password/page.tsx**

```tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBranding } from "@/lib/use-branding";

type Step = "email" | "otp" | "success";

const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#6366F1] focus:bg-white focus:ring-1 focus:ring-[#6366F1]";

function ForgotPasswordForm() {
  const params = useSearchParams();
  const joinToken = params.get("token") ?? "";
  const branding = useBranding(joinToken);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginHref = joinToken ? `/candidate/login?token=${joinToken}` : "/candidate/login";

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to send code. Please try again.");
        return;
      }
      setStep("otp");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed. Please try again.");
        return;
      }
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, joinToken }),
      });
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl mb-3"
            style={{ background: `linear-gradient(135deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
          >
            <span className="text-xl font-bold text-white">{branding.orgName.charAt(0)}</span>
          </div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#64748B]">{branding.orgName}</p>
        </div>

        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm">
          {step === "email" && (
            <>
              <h1 className="text-xl font-semibold text-[#0F172A] mb-2">Forgot password?</h1>
              <p className="text-sm text-[#64748B] mb-6">Enter your registered email to receive a 6-digit reset code.</p>
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={inputCls}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
                >
                  {loading ? "Sending…" : "Send reset code →"}
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <h1 className="text-xl font-semibold text-[#0F172A] mb-2">Enter reset code</h1>
              <p className="text-sm text-[#64748B] mb-6">
                A 6-digit code was sent to <strong>{email}</strong>. It expires in 15 minutes.
              </p>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Reset code</label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className={`${inputCls} font-mono tracking-widest text-center text-lg`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">New password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Confirm new password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className={inputCls}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
                >
                  {loading ? "Verifying…" : "Reset password →"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="mt-3 w-full text-center text-xs text-[#64748B] hover:text-[#0F172A] disabled:opacity-50"
              >
                Resend code
              </button>
            </>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 border border-green-200">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#0F172A] mb-2">Password updated</h2>
              <p className="text-sm text-[#64748B] mb-6">You can now log in with your new password.</p>
              <Link
                href={loginHref}
                className="inline-block w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center"
                style={{ background: `linear-gradient(115deg, ${branding.primaryColour} 0%, #6366F1 100%)` }}
              >
                Go to login →
              </Link>
            </div>
          )}
        </div>

        {step !== "success" && (
          <p className="mt-4 text-center text-xs text-[#94A3B8]">
            Remember your password?{" "}
            <Link href={loginHref} className="text-[#6366F1] hover:underline underline-offset-2">
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Add "Forgot password?" link to login page**

In `app/candidate/login/page.tsx`, after the Sign In button (after `</button>` inside the form, before `</form>`), add:

```tsx
            <div className="text-right">
              <Link
                href={joinToken ? `/candidate/forgot-password?token=${joinToken}` : "/candidate/forgot-password"}
                className="text-xs text-[#64748B] hover:text-[#6366F1] hover:underline underline-offset-2"
              >
                Forgot your password?
              </Link>
            </div>
```

Also add the `Link` import at the top of the file (it's not currently imported):

```tsx
import Link from "next/link";
```

The updated form in `app/candidate/login/page.tsx` should look like:

```tsx
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Access ID</label>
              <input
                type="text"
                value={accessId}
                onChange={e => setAccessId(e.target.value.toUpperCase())}
                placeholder="RELA-000001"
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#6366F1] py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <div className="text-right">
              <Link
                href={joinToken ? `/candidate/forgot-password?token=${joinToken}` : "/candidate/forgot-password"}
                className="text-xs text-[#64748B] hover:text-[#6366F1] hover:underline underline-offset-2"
              >
                Forgot your password?
              </Link>
            </div>
          </form>
```

- [ ] **Step 3: Verify full flow in browser**

```bash
npm run dev
```

1. Go to `/candidate/login?token=<a campaign joinToken>` — confirm "Forgot your password?" link appears
2. Click link → lands on `/candidate/forgot-password?token=<joinToken>`  
3. Enter the email of a known candidate → click "Send reset code"  
4. Confirm page advances to OTP step showing masked email address  
5. Enter OTP from email + new password (8+ chars) + confirm → "Reset password"  
6. Confirm success screen appears with "Go to login →" link  
7. Click link → confirm login page loads and new password works  
8. Check inbox: confirm "Password Updated" confirmation email arrived

- [ ] **Step 4: Commit**

```bash
git add app/candidate/forgot-password/page.tsx app/candidate/login/page.tsx
git commit -m "feat: forgot-password page with two-step OTP reset and login page link"
```

---

## Self-Review Checklist

| Spec requirement | Task |
|---|---|
| Enable Clerk auth on /admin and /api/admin | Task 1 |
| Remove "Continue to exam (test only)" button | Task 2 |
| Install Resend, create lib/email.ts with sendCredentials, sendOTP, sendPasswordChanged | Task 3 |
| Add formatExamDate to lib/campaign-utils.ts | Task 3 |
| Add otpHash + otpExpiresAt to Candidate schema | Task 4 |
| Fire credential emails on CSV import; surface emailFailures in response | Task 5 |
| POST /api/auth/forgot-password — OTP generation, bcrypt hash, 15-min expiry, no enumeration | Task 6 |
| POST /api/auth/verify-otp — validate hash + expiry, update password, clear OTP fields, min 8 chars | Task 6 |
| Two-step forgot-password page reading joinToken from ?token= | Task 7 |
| "Forgot password?" link on login page | Task 7 |
| ClerkProvider already in root layout — no change needed | ✓ confirmed |
