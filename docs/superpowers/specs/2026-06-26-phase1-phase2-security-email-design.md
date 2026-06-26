# Phase 1 + 2: Security & Email — Design Spec

**Date:** 2026-06-26  
**Status:** Approved  
**Scope:** Gap analysis items 1, 2, 3, 7

---

## Phase 1 — Security

### 1a. Admin authentication via Clerk

**Problem:** `middleware.ts` is a passthrough — anyone who discovers `/admin` has full access to all campaigns and candidate PII.

**Solution:** Replace `middleware.ts` with Clerk's `clerkMiddleware`. Protect all `/admin/**` and `/api/admin/**` routes. All other routes (candidate-facing) remain public.

Clerk is already installed (`@clerk/nextjs` in `package.json`). No new packages needed.

**Files changed:**
- `middleware.ts` — rewritten to use `clerkMiddleware` + `createRouteMatcher`
- `app/admin/layout.tsx` — verify `<ClerkProvider>` is present (add if not; root layout may already have it)

**Env vars required (both `.env.local` and production):**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

**Behaviour:**
- Unauthenticated requests to `/admin/**` → redirect to Clerk hosted sign-in
- Unauthenticated requests to `/api/admin/**` → 401 JSON response
- Candidate routes (`/candidate/**`, `/apply/**`, `/api/candidate/**`, `/api/auth/**`) → always public

**middleware.ts target shape:**
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

---

### 1b. Remove "test only" button from waiting room

**Problem:** `app/candidate/waiting-room/page.tsx:156–164` renders a button visible to all candidates that navigates directly to `/candidate/exam`, bypassing the session gate.

**Solution:** Delete those lines. The only entry path into the exam remains the `SESSION_START` socket event.

**Files changed:**
- `app/candidate/waiting-room/page.tsx` — delete lines 156–164 (the `{/* Test button */}` block)

---

## Phase 2 — Email

### 2a. Resend integration (`lib/email.ts`)

**New file:** `lib/email.ts`

Wraps the Resend SDK. Exports three typed async functions. Reads `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` from env. Throws at import time if `RESEND_API_KEY` is missing (fail fast).

**Functions:**

```ts
sendCredentials(opts: {
  to: string;
  name: string;
  accessId: string;
  password: string;
  loginUrl: string;
  examDate?: string;   // formatted string, e.g. "July 15, 2026 at 10:00 AM EDT"
}): Promise<void>

sendOTP(opts: {
  to: string;
  name: string;
  code: string;        // 6-digit string
}): Promise<void>

sendPasswordChanged(opts: {
  to: string;
  name: string;
}): Promise<void>
```

Templates are inline HTML strings — plain but branded (org name pulled from `OrgBranding` at send time via a helper `getOrgBranding()` that queries the DB once and caches in module scope for the process lifetime).

**New env vars:**
```
RESEND_API_KEY=re_...
NEXT_PUBLIC_APP_URL=https://your-domain.com   # already likely set; used for loginUrl
RESEND_FROM_EMAIL=noreply@your-domain.com
```

**Package:** `resend` (add to `dependencies`)

---

### 2b. Credential emails on candidate import

**File changed:** `app/api/admin/campaigns/[id]/candidates/import/route.ts`

After the `prisma.$transaction` succeeds, fire credential emails in parallel:

```ts
const emailResults = await Promise.allSettled(
  credentials.map(c =>
    sendCredentials({
      to: c.email,
      name: c.name,
      accessId: c.accessId,
      password: c.password,
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/candidate/login`,
      examDate: campaign.scheduledAt
        ? formatExamDate(campaign.scheduledAt)
        : undefined,
    })
  )
);

const emailFailures = emailResults
  .map((r, i) => r.status === "rejected" ? credentials[i].email : null)
  .filter(Boolean);
```

API response gains an `emailFailures: string[]` field. The admin import UI shows a warning if any bounced (non-blocking — the import succeeds regardless).

**Helper:** `formatExamDate(date: Date): string` — added to `lib/campaign-utils.ts`, formats as `"MMMM D, YYYY at h:mm A z"` using `Intl.DateTimeFormat`.

---

### 2c. Forgot-password flow

#### Schema changes

Add two nullable fields to `Candidate`:

```prisma
otpHash      String?
otpExpiresAt DateTime?
```

Run `prisma migrate dev --name add-otp-fields`.

#### New API routes

**`POST /api/auth/forgot-password`**
- Body: `{ email: string, joinToken: string }`
- Resolves `campaignId` from `joinToken` (same pattern as `/api/auth/login`). If campaign not found → 404. Finds candidate by `(email, campaignId)`. If not found, returns `{ ok: true }` anyway (no email enumeration).
- Generates 6-digit OTP with `crypto.randomInt(100000, 999999).toString()`.
- Hashes OTP with bcrypt (cost 10), stores `otpHash` + `otpExpiresAt = now + 15min`.
- Calls `sendOTP(...)`.
- Returns `{ ok: true }`.

**`POST /api/auth/verify-otp`**
- Body: `{ email: string, joinToken: string, code: string, newPassword: string }`
- Finds candidate, checks `otpExpiresAt > now`, verifies `bcrypt.compare(code, otpHash)`.
- On success: updates `passwordHash = hashPassword(newPassword)`, clears `otpHash` + `otpExpiresAt`, calls `sendPasswordChanged(...)`.
- Returns `{ ok: true }` or `{ error: "Invalid or expired code" }` (single error message for both failure modes — no oracle).
- New password validation: minimum 8 characters, enforced server-side.

#### New page: `app/candidate/forgot-password/page.tsx`

Single page, two-step UI (no navigation between steps — state machine in component):

- **Step 1 (`email`):** Email address field + "Send reset code" button. Reads `?token=` from URL to pre-populate campaign context (same `joinToken` flow as login).
- **Step 2 (`otp`):** "Enter the 6-digit code sent to [email]" + code input + new password field + confirm password field + "Reset password" button.
- On success: shows inline confirmation "Password updated — you can now log in." with a link to `/candidate/login?token=...`.
- Resend code link in Step 2 calls Step 1 handler again (re-POSTs forgot-password, replaces OTP).

#### Login page change

`app/candidate/login/page.tsx` — add a "Forgot your password?" link below the Sign In button, pointing to `/candidate/forgot-password?token=${joinToken}`.

---

## Data flow summary

```
Admin imports CSV
  → candidates created in DB
  → Promise.allSettled(sendCredentials × N)
  → email failures surfaced in import response

Candidate loses password
  → POST /api/auth/forgot-password
  → OTP hashed + stored, sendOTP fired
  → Candidate enters code + new password
  → POST /api/auth/verify-otp
  → passwordHash updated, OTP cleared, sendPasswordChanged fired
  → Candidate logs in normally
```

---

## What this spec does NOT cover

- Lifecycle notification emails (24h reminder, exam open, completion, disqualification, shortlisted) — Phase 4+5
- React Email templates — Phase 4+5
- Rate limiting on OTP endpoints — acceptable risk at this scale; revisit if abused
- Email unsubscribe / bounce handling — not needed for transactional exam credentials
