# PreCognise Assess — Platform Redesign Spec

**Date:** 2026-06-24  
**Status:** Approved  
**Scope:** Full UX/UI polish and platform quality uplift for PreCognise Assess

---

## Overview

PreCognise Assess is a B2B hiring assessment platform sold to employers for large-scale recruitment testing. The underlying assessment engine (sessions, candidates, questions, real-time proctoring) is already built. This spec covers the design system, landing page, admin portal, and candidate-facing flow needed to make it feel like a professional, production-grade product.

**Deployment model:** Single-tenant per client for now. Each employer gets their own instance. Architecture should be multi-tenancy-ready but no shared-tenant infrastructure is required in this phase.

---

## Design System

All UI uses the PreCognize design token set.

| Token | Value |
|---|---|
| Primary | `#2E0BFC` |
| Primary hover | `#1E06B8` |
| Primary light | `#EEF2FF` |
| Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Text | `#0F172A` |
| Text secondary | `#64748B` |
| Text muted | `#94A3B8` |
| Border | `#E2E8F0` |
| Gradient | `linear-gradient(115deg, #2E0BFC 0%, #4D32F5 45%, #6366F1 100%)` |

**Fonts:** Bricolage Grotesque (headings, weights 600–800) + Inter (body, weights 400–600). Both already wired into `app/layout.tsx` and `globals.css`.

**Border radius:** Cards 12–16px, buttons 8–10px, inputs 8px, pills 100px.

**Shadows:** Subtle — `0 1px 3px rgba(0,0,0,0.06)` default; `0 4px 16px rgba(46,11,252,0.08)` on hover for primary-adjacent cards.

---

## Landing Page (`/`)

**Purpose:** Candidate-facing. Motivates candidates before assessment, explains the value of structured assessment, and explains how PreCognise works. **Not a sales page.** No employer sign-up flow.

**Primary CTA:** "Begin your assessment" → `/candidate/login`

### Sections (in order)

1. **Nav** — PreCognise logo + "Assess" badge, sticky. Single right-side CTA: "Log in →".

2. **Hero** — Full-width gradient banner (`--gradient`). Eyebrow: "Your assessment is waiting." Headline: *"Show what you're truly capable of."* Subtext explains fairness and scientific approach. Two CTAs: primary white button (begin assessment) + ghost button (how it works anchor).

3. **Trust bar** — White section, two-column editorial layout:
   - Left: PreCognise logo lockup + large quote mark + philosophy statement: *"The fairest interview question is the one every candidate answers under exactly the same conditions."* + italic attribution.
   - Right: Three stats stacked with large bold numbers — `12` (minutes avg), `0` (downloads required), `1` (standard for every candidate) — each with a human-language description below.

4. **Why it matters** — Three white cards: "Decisions backed by data", "A fair chance for every applicant", "Faster shortlisting at scale". Each with a light-purple icon square and 2-sentence editorial copy.

5. **How it works** — White section background. Three numbered steps (gradient circle badges): Register → Wait for session → Complete and submit. Copy emphasises the simultaneous-start fairness model.

6. **What to expect** — Two-column: left is a checklist (browser-based, thinking-focused questions, auto-submit, tab integrity monitoring); right is a gradient card with pre-test tips (quiet space, laptop preferred, credentials ready, stay on tab). **No mention of candidates viewing their results — results go to the employer only.**

7. **About PreCognise** — Light purple background section. Two-column: left has logo + "Professional credentialing platform" badge + short description. Right has editorial copy explaining the PreCognise philosophy (structured > gut feel).

8. **CTA banner** — Gradient full-width. "Ready to begin your assessment?" + "Go to login" white button.

9. **Footer** — Dark (`#0F172A`) background. Logo (inverted white) + "PreCognise Assess" name left. Copyright right.

---

## Admin Portal

### Layout

**Shell:** Fixed left sidebar (232px) + scrollable main content area. The sidebar never scrolls; the main area does.

### Sidebar

- **Top:** PreCognise logo + "Assess" pill badge
- **Navigation items (with icons):**
  - Dashboard (home grid icon)
  - Live Session — shows an animated green "Live" count badge when a session is active
  - Campaigns — shows a count badge
  - Candidates
  - Questions
  - — divider — Settings section —
  - Branding
  - Settings
- **Active state:** `var(--primary-light)` background, `var(--primary)` text and icon
- **Hover state:** `var(--bg)` background
- **Bottom:** User card with initials avatar (gradient), name, role, chevron

### Top Bar

Sticky, white, `56px` tall. Left: page title (Bricolage Grotesque, 700). Right: date label + ghost "Export" button + primary gradient "New Session" button.

### Dashboard — Split Layout

#### Top half: Live Session

Shown when a session is active. Has a green pulsing "Active" badge in the section header.

**Three-column grid:**

1. **Main session card** (2fr) — Green border glow when active. Shows: session name, campaign name, elapsed timer (large). Below: three candidate counts (joined / active / submitted) with coloured dot indicators. Footer row: Broadcast button (purple), Pause button (ghost), End Session button (red, right-aligned).

2. **Submission progress card** (1fr) — Progress bar (gradient fill) showing % submitted. Below: stage breakdown table: waiting room / answering / submitted / disqualified with counts.

3. **Broadcast card** (1fr) — Textarea + "Send to all candidates" gradient button. Shows last broadcast message with timestamp below.

When no session is active, this section shows a neutral empty state: "No active session" with a "Start Session" CTA.

#### Bottom half: Historical Analytics

**Time range selector** dropdown (30 days / 90 days / All time).

**Four KPI cards** in a row:
| Card | Icon colour | Delta direction |
|---|---|---|
| Total Sessions | Blue | Up = good |
| Total Candidates | Green | Up = good |
| Avg. Score | Amber | Context-dependent |
| Completion Rate | Rose | Up = good |

Each card: label top-left, icon top-right, large number (Bricolage 800), delta line below (green ↑ or red ↓ vs previous period).

**Recent Sessions table** — White panel with header row. Columns: Session name + campaign (stacked), Date, Candidates, Avg Score (bar + %, hidden until session ends), Status pill, Action link.

Status pills:
- **Live** — green with animated pulse dot
- **Completed** — green
- **Scheduled** — amber
- **Draft** — grey outline

---

## Candidate Flow (existing pages — design tokens applied)

All candidate-facing pages use `bg-[#F8FAFC]` background, white cards with `border-[#E2E8F0]`, and the primary gradient for brand elements. All already implemented — no structural changes required.

Pages covered:
- `/candidate/login` — Gradient brand header card, white form, styled inputs
- `/candidate/verify-otp` — OTP digit inputs with purple focus ring
- `/candidate/waiting-room` — Org avatar, countdown ring, joined-count indicator
- `/candidate/disqualified` — Red badge, explanation card, back to login link
- `/apply/[slug]` — Brand header from org branding, registration form, credentials card

**Candidate results:** Candidates do not see their scores or results at any point. Results are available only to the employer admin.

---

## What Is Not In Scope

- Employer self-signup / multi-tenant onboarding
- Candidate results view
- Email notification system (beyond existing OTP)
- Analytics charts / data visualisations (table data only in this phase)
- Mobile-optimised admin portal (candidate pages are mobile-friendly; admin is desktop-first)

---

## Key Implementation Files

| Area | File(s) |
|---|---|
| Design tokens | `app/globals.css`, `app/layout.tsx` |
| Landing page | `app/page.tsx` (new — currently no landing page) |
| Admin dashboard | `app/admin/page.tsx` |
| Admin live session | `app/admin/session/page.tsx` |
| Sidebar layout | `app/admin/layout.tsx` (add sidebar shell) |
| KPI card component | `components/admin/KpiCard.tsx` |
| Candidate grid | `components/admin/CandidateGrid.tsx` |
| Session controls | `components/admin/SessionControls.tsx` |
| Candidate login | `app/candidate/login/page.tsx` |
| Waiting room | `app/candidate/waiting-room/page.tsx` |
| Branding hook | `lib/use-branding.ts` |
