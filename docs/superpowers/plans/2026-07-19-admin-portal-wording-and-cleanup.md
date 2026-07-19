# Admin Portal Wording Pass & Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite admin- and candidate-facing copy to plain, HR-friendly language (TestGorilla/Moodle tone) with an explanation under every field, remove the confirmed-broken pre-multi-campaign "Roll Number" system, and fix the copy/logic bugs found along the way (Dashboard status badge always showing "Inactive", tab-switch warning stating the wrong number).

**Architecture:** No new subsystems. This is (a) a new small shared label-mapping utility (`lib/labels.ts`) consumed by six existing status-badge render sites, (b) deletion of orphaned legacy files plus a rebuild of the Dashboard home page down to its working parts, (c) text-only edits to existing components, and (d) two small, contained logic changes (Dashboard status field, TabSwitchModal props).

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres, Tailwind (inline classes), Socket.IO. No test framework exists in this repo — verification is `npx tsc --noEmit` plus manual dev-server exercise of each changed flow, matching the project's existing convention (confirmed: no `__tests__`/`*.test.*` files anywhere in the repo).

## Global Constraints

- Every input field must have a plain-language label + one short helper sentence beneath it. No field is left to explain itself.
- Numeric fields state the unit and blank/default behavior inline (e.g. "leave blank for no limit").
- Toggles state the consequence of both ON and OFF in one line each, not a dense paragraph.
- No unexplained jargon: "base points," "deploy," "fraction," raw field names (`speedBonusMax`), standard names ("ISO 3166-1"), and raw enum text (`DRAFT`, `ACTIVE`) must be translated to plain words.
- One concept = one word everywhere — "grace period" must not be reused for two different settings.
- Confirmations/errors state the real-world consequence, not the internal action name.
- Do not replace existing native `alert()`/`confirm()` calls with new modal components — only the text inside them changes.
- Do not add a rich-text editor, a downloadable CSV template file, or any other new UI mechanic — text and the specific small logic changes named in this plan only.
- Do not change casing convention (labels stay Title Case) — this is a wording pass, not a visual redesign.
- Spec reference: `docs/superpowers/specs/2026-07-19-admin-portal-wording-and-cleanup-design.md`

---

## Task 1: Shared status-label utility

**Files:**
- Create: `lib/labels.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `campaignStatusLabel(status: string): string` and `candidateStatusLabel(status: string): string`, both falling back to the raw input string for any status not in the map (so an unrecognized future enum value never renders blank). Consumed by Task 2 (Dashboard), Task 3 (campaign detail page), Task 8 (Live Session page), Task 9 (campaigns list + results pages).

- [ ] **Step 1: Create the file**

`lib/labels.ts`:
```ts
const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Not started",
  SCHEDULED: "Scheduled",
  LIVE: "Live now",
  PAUSED: "Paused",
  ENDED: "Ended",
};

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  JOINED: "Joined",
  ACTIVE: "In progress",
  COMPLETED: "Completed",
  DISQUALIFIED: "Disqualified",
};

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS_LABELS[status] ?? status;
}

export function candidateStatusLabel(status: string): string {
  return CANDIDATE_STATUS_LABELS[status] ?? status;
}
```

- [ ] **Step 2: Verify the mapping with a throwaway script (no test framework exists in this repo)**

Create `_verify_labels.mjs` (temporary, delete after):
```js
import { campaignStatusLabel, candidateStatusLabel } from "./lib/labels.ts";

const cases = [
  [campaignStatusLabel("DRAFT"), "Not started"],
  [campaignStatusLabel("LIVE"), "Live now"],
  [campaignStatusLabel("WEIRD_FUTURE_VALUE"), "WEIRD_FUTURE_VALUE"],
  [candidateStatusLabel("ACTIVE"), "In progress"],
  [candidateStatusLabel("DISQUALIFIED"), "Disqualified"],
];

let failed = false;
for (const [actual, expected] of cases) {
  if (actual !== expected) {
    failed = true;
    console.error(`FAIL: got "${actual}", expected "${expected}"`);
  }
}
console.log(failed ? "FAILED" : "PASS: all label mappings correct");
process.exitCode = failed ? 1 : 0;
```

Run (PowerShell, since this repo's Bash shell has no `node` on PATH):
```powershell
npx tsx _verify_labels.mjs
```
Expected: `PASS: all label mappings correct`

- [ ] **Step 3: Delete the throwaway script**

```bash
rm _verify_labels.mjs
```

- [ ] **Step 4: Commit**

```bash
git add lib/labels.ts
git commit -m "$(cat <<'EOF'
feat: add shared campaign/candidate status label mapping

Every status badge in the app currently renders the raw enum value
(DRAFT, ACTIVE, ...) as literal text. This adds a single source of
truth for the plain-language label, consumed by the next several
tasks at each of the six render sites that currently show raw text.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove the legacy Roll-Number flow and rebuild the Dashboard home page

**Files:**
- Delete: `app/admin/session/new/page.tsx`
- Delete: `components/admin/SessionControls.tsx`
- Delete: `components/admin/CandidateGrid.tsx`
- Delete: `app/api/admin/candidates/route.ts`
- Modify: `app/admin/page.tsx` (full-file rewrite)

**Interfaces:**
- Consumes: `campaignStatusLabel` from `lib/labels.ts` (Task 1).
- Produces: a working Dashboard limited to KPI cards + a correct Campaigns table. No other task depends on this one.

This is one task, not two, because the deletions alone leave `app/admin/page.tsx` with dangling imports and dead fetch calls that won't compile — there is no independently-reviewable midpoint between "legacy files deleted" and "Dashboard rebuilt to not reference them."

- [ ] **Step 1: Confirm blast radius is exactly as documented**

Run:
```bash
grep -rn "CandidateGrid\|SessionControls\|/api/admin/session\b\|/api/admin/candidates\b" --include="*.ts" --include="*.tsx" .
```
Expected output: exactly these files (besides the four being deleted):
- `app/admin/page.tsx` (imports `CandidateGrid`, fetches `/api/admin/candidates` and `/api/admin/session`) — fixed in Step 3 below.
- `components/admin/AdminSidebar.tsx` (links to `/admin/session`, the **real** Live Session page — not `/admin/session/new` — leave untouched).

If any other file shows up, STOP and re-investigate before deleting.

- [ ] **Step 2: Delete the four legacy files**

```bash
git rm app/admin/session/new/page.tsx
git rm components/admin/SessionControls.tsx
git rm components/admin/CandidateGrid.tsx
git rm app/api/admin/candidates/route.ts
```

- [ ] **Step 3: Replace `app/admin/page.tsx` in full**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import KpiCard from "@/components/admin/KpiCard";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/admin-socket-client";
import { campaignStatusLabel } from "@/lib/labels";

interface Stats {
  registered: number;
  joined: number;
  active: number;
  completed: number;
  disqualified: number;
  total: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count: { candidates: number };
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/admin/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCampaigns();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCampaigns]);

  useEffect(() => {
    const socket = getAdminSocket();
    socket.emit("admin:join");
    socket.on("stats:update", fetchStats);
    return () => {
      socket.off("stats:update");
      disconnectAdminSocket();
    };
  }, [fetchStats]);

  const completionRate = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-8 px-7 py-6">

      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Dashboard</h1>
          <p className="text-sm text-[#64748B]">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* ── ANALYTICS SECTION ────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#0F172A]">Overview</h2>
        </div>

        {/* KPI cards */}
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Total Candidates"
            value={stats?.total ?? 0}
            iconBg="bg-[#EEF2FF]"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2E0BFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
          />
          <KpiCard
            label="Active Now"
            value={stats?.active ?? 0}
            iconBg="bg-green-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>}
          />
          <KpiCard
            label="Completed"
            value={stats?.completed ?? 0}
            iconBg="bg-blue-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>}
          />
          <KpiCard
            label="Completion Rate"
            value={`${completionRate}%`}
            iconBg="bg-amber-50"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          />
        </div>

        {/* Campaigns table */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
            <p className="text-sm font-semibold text-[#0F172A]">Campaigns</p>
            <Link href="/admin/campaigns" className="text-xs font-medium text-[#2E0BFC] hover:underline">
              View all →
            </Link>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Candidates</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-[#94A3B8]">
                    No campaigns yet.{" "}
                    <Link href="/admin/campaigns" className="text-[#2E0BFC] hover:underline">Create one →</Link>
                  </td>
                </tr>
              ) : (
                campaigns.slice(0, 5).map((c) => (
                  <tr key={c.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3.5 font-medium text-[#0F172A]">{c.name}</td>
                    <td className="px-5 py-3.5 text-[#64748B]">
                      {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5 text-[#64748B]">{c._count.candidates}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                        c.status === "LIVE"
                          ? "bg-green-50 text-green-700"
                          : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
                      }`}>
                        {campaignStatusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/campaigns/${c.id}`} className="text-xs font-medium text-[#2E0BFC] hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
```

This removes: the `Live Session` card (Start/Pause/End — dead, called a nonexistent API), the `Broadcast to candidates` card (global, unscoped), the `Candidates` live grid (fed by the deleted global endpoint), the header's "New Session" button (redundant with the sidebar nav), and every piece of state/effect/handler that only existed to support those (`sessionStatus`, `busy`, `broadcastMsg`, `lastBroadcast`, `runSessionAction`, `sendBroadcast`, `fetchCandidates`, the `/api/admin/session` fetch, the `candidate:event` socket listener). It also fixes the `Campaign` interface to match what `/api/admin/campaigns` actually returns (`status`, not `active`/`slug`/`expiresAt`), which fixes the "always shows Inactive" bug.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev`), sign in as admin, open `/admin`:
- Confirm there is no "Live Session" card, no "Broadcast to candidates" card, and no live candidates grid.
- Confirm the Campaigns table shows real statuses (e.g. "Ended" for an ended campaign, "Live now" for a live one) instead of always "Inactive".
- Confirm the KPI cards still populate with numbers.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx
git commit -m "$(cat <<'EOF'
refactor: remove legacy Roll-Number flow, fix Dashboard status bug

Deletes the pre-multi-campaign session/new page and its Roll-Number
based components and API route (confirmed unused, and independently
broken: /api/admin/session has no backing route, every button on it
404s). Rebuilds the Dashboard home page down to just the working
pieces (KPI totals, Campaigns table), and fixes a real bug found
along the way: the Campaigns table checked a `campaign.active` field
the API never returns, so every campaign showed "Inactive" regardless
of real status.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Apply status labels + rename "grace period" on the campaign detail page

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx:2039` (candidate status badge text)
- Modify: `app/admin/campaigns/[id]/page.tsx:2193` (campaign status badge text)
- Modify: `app/admin/campaigns/[id]/page.tsx:618-626` (grace period rename)
- Modify: `app/admin/campaigns/[id]/page.tsx` (top of file — import)

**Interfaces:**
- Consumes: `campaignStatusLabel`, `candidateStatusLabel` from `lib/labels.ts` (Task 1).
- Produces: no new interface — leaf UI edits.

- [ ] **Step 1: Add the import**

Find the existing import block near the top of `app/admin/campaigns/[id]/page.tsx` and add:
```ts
import { campaignStatusLabel, candidateStatusLabel } from "@/lib/labels";
```

- [ ] **Step 2: Fix the candidate status badge**

Old (line 2039):
```tsx
                          {c.status}
```
New:
```tsx
                          {candidateStatusLabel(c.status)}
```

- [ ] **Step 3: Fix the campaign status badge**

Old (line 2193):
```tsx
          {campaign.status}
```
New:
```tsx
          {campaignStatusLabel(campaign.status)}
```

- [ ] **Step 4: Rename "Candidate entry grace period" to "Late join window"**

Old (lines 619-626):
```tsx
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Candidate entry grace period
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              How long after the assessment starts candidates can still join.
              Set to 0 to allow no late entry.
            </p>
```
New:
```tsx
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Late join window
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              How long after the assessment starts candidates can still join.
              Set to 0 to allow no late entry.
            </p>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

On `/admin/campaigns/[id]` for any existing campaign: confirm the header status badge reads a plain label (e.g. "Ended", "Live now") instead of raw text, the candidates table status column shows plain labels (e.g. "In progress" instead of "ACTIVE"), and the Settings tab shows "Late join window" instead of "Candidate entry grace period".

- [ ] **Step 7: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
fix: use plain status labels and rename grace-period field

Campaign/candidate status badges rendered raw enum text (DRAFT,
ACTIVE) verbatim; now go through the shared label map. Also renames
"Candidate entry grace period" to "Late join window" so it no longer
collides in name with the unrelated global "Grace period after
timer" setting.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Campaign creation wizard wording

**Files:**
- Modify: `app/admin/campaigns/new/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — leaf UI edits.

- [ ] **Step 1: Campaign Name — add helper**

Old (around line 108-116):
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Campaign Name *</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.name}
              onChange={e => update("name", e.target.value)}
              placeholder="e.g. Relationship Manager Assessment — RBC Canada"
            />
          </div>
```
New:
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Campaign Name *</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.name}
              onChange={e => update("name", e.target.value)}
              placeholder="e.g. Relationship Manager Assessment — RBC Canada"
            />
            <p className="mt-1 text-xs text-[#64748B]">
              This is what candidates and your team will see — e.g. &quot;Java Developer Assessment.&quot;
            </p>
          </div>
```

- [ ] **Step 2: Logo URL — add helper**

Old (lines 117-125):
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.logoUrl}
              onChange={e => update("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
```
New:
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.logoUrl}
              onChange={e => update("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-1 text-xs text-[#64748B]">
              Link to your company logo. Shown to candidates on the login and exam screens.
            </p>
          </div>
```

- [ ] **Step 3: Background Colour — add helper**

Old (lines 126-136):
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Background Colour</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={draft.bgColor} onChange={e => update("bgColor", e.target.value)} className="h-9 w-12 rounded border border-[#E2E8F0] cursor-pointer" />
              <input
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-mono"
                value={draft.bgColor}
                onChange={e => update("bgColor", e.target.value)}
              />
            </div>
          </div>
```
New:
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Background Colour</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={draft.bgColor} onChange={e => update("bgColor", e.target.value)} className="h-9 w-12 rounded border border-[#E2E8F0] cursor-pointer" />
              <input
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-mono"
                value={draft.bgColor}
                onChange={e => update("bgColor", e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              Background color candidates see behind your logo.
            </p>
          </div>
```

- [ ] **Step 4: Scheduled Start — add helper**

Old (lines 160-168):
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Start (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledAt}
              onChange={e => update("scheduledAt", e.target.value)}
            />
          </div>
```
New:
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled Start (optional)</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.scheduledAt}
              onChange={e => update("scheduledAt", e.target.value)}
            />
            <p className="mt-1 text-xs text-[#64748B]">
              When candidates can start joining. Leave blank to let them join anytime.
            </p>
          </div>
```

- [ ] **Step 5: Auto-start toggle — add helper**

Old (lines 169-172):
```tsx
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.autoStart} onChange={e => update("autoStart", e.target.checked)} />
            Auto-start at scheduled time
          </label>
```
New:
```tsx
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.autoStart} onChange={e => update("autoStart", e.target.checked)} className="mt-0.5" />
            <span>
              Auto-start at scheduled time
              <p className="text-xs text-[#64748B] font-normal">
                On: the assessment goes live automatically at the scheduled time. Off: you&apos;ll click &quot;Go live&quot; yourself when ready.
              </p>
            </span>
          </label>
```

- [ ] **Step 6: Max Candidates → Candidate limit**

Old (lines 173-182):
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Max Candidates</label>
            <input
              type="number"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.maxCandidates}
              onChange={e => update("maxCandidates", e.target.value)}
              placeholder="e.g. 12000"
            />
          </div>
```
New:
```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Candidate limit</label>
            <input
              type="number"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
              value={draft.maxCandidates}
              onChange={e => update("maxCandidates", e.target.value)}
              placeholder="e.g. 500 (leave blank for no limit)"
            />
            <p className="mt-1 text-xs text-[#64748B]">
              The most people who can be added to this assessment. Once reached, no one else can be added or join.
            </p>
          </div>
```

- [ ] **Step 7: Negative marking toggle — add helper**

Old (lines 183-186):
```tsx
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.negativeMarking} onChange={e => update("negativeMarking", e.target.checked)} />
            Enable negative marking
          </label>
```
New:
```tsx
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={draft.negativeMarking} onChange={e => update("negativeMarking", e.target.checked)} className="mt-0.5" />
            <span>
              Enable negative marking
              <p className="text-xs text-[#64748B] font-normal">
                On: candidates lose points for wrong answers, not just skipped ones. Off: wrong and skipped answers both score zero.
              </p>
            </span>
          </label>
```

- [ ] **Step 8: Deduction fraction → Penalty for wrong answers**

Old (lines 187-200):
```tsx
          {draft.negativeMarking && (
            <div>
              <label className="block text-sm font-medium mb-1">Deduction fraction (0.00–1.00)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="w-40 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={draft.negativeMarkingValue}
                onChange={e => update("negativeMarkingValue", e.target.value)}
              />
              <p className="text-xs text-[#64748B] mt-1">Deduct {draft.negativeMarkingValue}× base points per wrong answer</p>
            </div>
          )}
```
New:
```tsx
          {draft.negativeMarking && (
            <div>
              <label className="block text-sm font-medium mb-1">Penalty for wrong answers</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="w-40 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={draft.negativeMarkingValue}
                onChange={e => update("negativeMarkingValue", e.target.value)}
              />
              <p className="text-xs text-[#64748B] mt-1">
                Candidates lose this fraction of a question&apos;s points for each wrong answer. A wrong answer currently costs {draft.negativeMarkingValue} of that question&apos;s points.
              </p>
            </div>
          )}
```

- [ ] **Step 9: Step 3 note**

Old (line 219):
```tsx
          <p className="text-sm text-[#64748B] mb-4">You can add questions from the Manage page after finishing setup.</p>
```
New:
```tsx
          <p className="text-sm text-[#64748B] mb-4">Questions aren&apos;t added here — you&apos;ll add them from the campaign&apos;s Questions tab after finishing this setup.</p>
```

- [ ] **Step 10: Step 4 note**

Old (line 233):
```tsx
          <p className="text-sm text-[#64748B] mb-4">Import candidates from the Manage page, or finish setup now.</p>
```
New:
```tsx
          <p className="text-sm text-[#64748B] mb-4">You can add candidates now from the campaign page, or come back to it later.</p>
```

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 12: Manual verification**

Walk through `/admin/campaigns/new` end to end (all 4 steps) in the dev server. Confirm every field shows the new helper text and the wizard still creates a campaign successfully.

- [ ] **Step 13: Commit**

```bash
git add app/admin/campaigns/new/page.tsx
git commit -m "$(cat <<'EOF'
docs(copy): plain-language rewrite of the campaign creation wizard

Adds a helper sentence under every field, renames Max Candidates to
Candidate limit and the deduction-fraction field to Penalty for wrong
answers, and drops "base points" jargon from the live preview text.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Campaign settings fields wording (Overview/Settings tab)

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (Settings form section, ~lines 334-947)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — leaf UI edits.

- [ ] **Step 1: Deploy button → Go live**

Find the Deploy banner section (around lines 366-388):
```tsx
      {campaign.status === "DRAFT" && (
        <section className="rounded-2xl border border-[#6366F1]/30 bg-gradient-to-br from-[#6366F1]/5 to-indigo-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Ready to go live?
              </h2>
              <p className="mt-1 text-sm text-[#64748B]">
                Deploy this campaign to make it live. You can pause, resume, or
                end it any time from the Live Session page.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="shrink-0 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4F46E5] disabled:opacity-60 transition-colors"
            >
              {deploying ? "Deploying…" : "Deploy Campaign"}
            </button>
          </div>
        </section>
      )}
```
Replace with:
```tsx
      {campaign.status === "DRAFT" && (
        <section className="rounded-2xl border border-[#6366F1]/30 bg-gradient-to-br from-[#6366F1]/5 to-indigo-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Ready to go live?
              </h2>
              <p className="mt-1 text-sm text-[#64748B]">
                Once live, candidates can join using the link below and start their assessment. You can pause, resume, or
                end it any time from the Live Session page.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="shrink-0 rounded-lg bg-[#6366F1] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#4F46E5] disabled:opacity-60 transition-colors"
            >
              {deploying ? "Going live…" : "Go live"}
            </button>
          </div>
        </section>
      )}
```

- [ ] **Step 2: Save-failure and deploy-failure alerts**

Old (line 325):
```tsx
        alert(d.error ?? "Failed to save");
```
New:
```tsx
        alert(d.error ?? "We couldn't save your changes. Please try again.");
```

Old (line 344):
```tsx
        alert(d.error ?? "Failed to deploy campaign");
```
New:
```tsx
        alert(d.error ?? "We couldn't take this campaign live. Please try again.");
```

- [ ] **Step 3: Max candidates → Candidate limit (settings form)**

Old (lines 504-516):
```tsx
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Max candidates
              </label>
              <input
                type="number"
                min={1}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
              />
            </div>
```
New:
```tsx
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                Candidate limit
              </label>
              <input
                type="number"
                min={1}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(e.target.value)}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#6366F1]"
              />
              <p className="mt-1 text-xs text-[#64748B]">
                The most people who can be added. Once reached, no one else can be added or join.
              </p>
            </div>
```

- [ ] **Step 4: Deduction fraction (settings form)**

Old (lines 572-585):
```tsx
            {negativeMarking && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Deduction fraction (e.g. 0.25 = ¼ of base points)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={negativeMarkingValue}
                  onChange={(e) => setNegativeMarkingValue(e.target.value)}
                  className="w-40 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
            )}
```
New:
```tsx
            {negativeMarking && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Penalty for wrong answers
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={negativeMarkingValue}
                  onChange={(e) => setNegativeMarkingValue(e.target.value)}
                  className="w-40 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Candidates lose this fraction of a question&apos;s points for each wrong answer — e.g. 0.25 means losing a quarter.
                </p>
              </div>
            )}
```

- [ ] **Step 5: Duplicate login toggle**

Old (lines 590-599):
```tsx
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">
                Disqualify on duplicate login
              </p>
              <p className="text-xs text-[#64748B]">
                If a candidate logs in from a second device, disqualify them and
                end both sessions. When off, the second device is simply
                blocked.
              </p>
            </div>
```
New:
```tsx
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E2E8F0] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">
                Block duplicate logins
              </p>
              <p className="text-xs text-[#64748B]">
                On: a second login disqualifies the candidate and ends both sessions immediately. Off: the second device is blocked, but the original session keeps running.
              </p>
            </div>
```

- [ ] **Step 6: Tab switch limit helper**

Old (lines 699-705):
```tsx
                  <p className="mb-2 text-xs font-medium text-[#0F172A]">
                    Tab switch limit
                  </p>
                  <p className="mb-2 text-xs text-[#64748B]">
                    Disqualify after this many switches. 0 = disqualify on 1st
                    switch.
                  </p>
```
New:
```tsx
                  <p className="mb-2 text-xs font-medium text-[#0F172A]">
                    Tab switch limit
                  </p>
                  <p className="mb-2 text-xs text-[#64748B]">
                    Number of tab switches allowed before disqualifying the candidate. Set to 0 to disqualify on the very first switch.
                  </p>
```

- [ ] **Step 7: Pre-exam instructions — clarify it's optional**

Old (lines 921-931):
```tsx
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Pre-exam instructions
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              Shown to candidates on the instructions screen before they start.
              Supports basic HTML like{" "}
              <code className="font-mono">&lt;b&gt;</code>,{" "}
              <code className="font-mono">&lt;ul&gt;</code>,{" "}
              <code className="font-mono">&lt;li&gt;</code>. Leave blank to show
              only the auto-generated anti-cheat rules.
            </p>
```
New:
```tsx
            <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
              Pre-exam instructions
            </label>
            <p className="mb-2 text-xs text-[#64748B]">
              Optional — shown to candidates before they start. Supports basic HTML like{" "}
              <code className="font-mono">&lt;b&gt;</code>,{" "}
              <code className="font-mono">&lt;ul&gt;</code>,{" "}
              <code className="font-mono">&lt;li&gt;</code>. Leave blank to show
              only the auto-generated anti-cheat rules.
            </p>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Manual verification**

On an existing DRAFT campaign's Settings tab in the dev server: confirm the "Go live" button and copy, Candidate limit field + helper, Penalty for wrong answers field + helper, Block duplicate logins toggle text, Tab switch limit helper, and Pre-exam instructions helper all show the new copy, and that saving settings still works (trigger the save-failure alert path by briefly disconnecting network to confirm the new alert text appears, then reconnect).

- [ ] **Step 10: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
docs(copy): plain-language rewrite of campaign settings fields

Deploy Campaign -> Go live, Max candidates -> Candidate limit,
deduction fraction -> Penalty for wrong answers (unified with the
wizard's wording), tightens the duplicate-login toggle text, and
replaces the "0 =" shorthand on tab-switch limit with a plain
sentence.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Candidates tab wording (CSV, credentials, confirms)

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (Candidates tab section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: Delete-question confirm**

Old (line 1098):
```tsx
    if (!confirm("Delete this question?")) return;
```
New:
```tsx
    if (!confirm("Delete this question? This can't be undone, and any existing candidate answers to it will be lost.")) return;
```

- [ ] **Step 2: Remove-candidate confirm**

Old (line 1688):
```tsx
    if (!confirm("Remove this candidate?")) return;
```
New:
```tsx
    if (!confirm("Remove this candidate? Their access ID and password will stop working immediately.")) return;
```

- [ ] **Step 3: Remove-all confirm text**

Old (lines 1981-1983):
```tsx
                <span className="text-xs text-[#64748B]">
                  Remove all {candidates.length}?
                </span>
```
New:
```tsx
                <span className="text-xs text-[#64748B]">
                  Remove all {candidates.length} candidates? This can&apos;t be undone.
                </span>
```

- [ ] **Step 4: One-time credentials note — add explanation**

Find (around line 1771, the credentials panel heading):
```tsx
            <p className="text-xs font-semibold text-[#6366F1] mb-3">
              One-time credentials — save these now
            </p>
```
Replace with:
```tsx
            <p className="text-xs font-semibold text-[#6366F1] mb-1">
              One-time credentials — save these now
            </p>
            <p className="text-xs text-[#64748B] mb-3">
              You won&apos;t be able to see this password again after you leave this page — copy or download it now.
            </p>
```

- [ ] **Step 5: CSV helper text**

Find the CSV columns hint (around lines 1806-1810 and 1829, both instances of "name, email" instructional text — search for `Columns required`):
```tsx
Columns required: name, email
```
Replace both occurrences with:
```tsx
Your file needs two columns: name and email (any order, header names aren't case-sensitive). We'll generate a unique access ID and password for each row automatically.
```

- [ ] **Step 6: Catch-block error messages**

Old (in `handleManualAdd`'s catch block):
```tsx
    } catch {
      setManualError("Failed to add candidate — check your connection and try again");
    } finally {
```
New:
```tsx
    } catch {
      setManualError("Something went wrong adding this candidate. Please check your connection and try again.");
    } finally {
```

Old (in `handleImport`'s catch block):
```tsx
    } catch {
      setImportError("Import failed — check your connection and try again");
    } finally {
```
New:
```tsx
    } catch {
      setImportError("Something went wrong importing candidates. Please check your connection and try again.");
    } finally {
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Manual verification**

On the Candidates tab: manually add a candidate and confirm the credentials panel shows the new explanation line; check the CSV upload area shows the new helper text; trigger "Remove all" and confirm the new confirmation text; delete a question from the Questions tab and confirm the new confirm dialog text.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
docs(copy): plain-language rewrite of Candidates tab messaging

Confirm dialogs now state the real consequence instead of just the
action name, the CSV helper explains the exact required format, and
catch-block error messages no longer overclaim the cause.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Questions tab wording

**Files:**
- Modify: `app/admin/campaigns/[id]/page.tsx` (Questions tab section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: MCQ / Image MCQ type labels**

Old (line 992):
```tsx
  { value: "mcq", label: "MCQ" },
```
New:
```tsx
  { value: "mcq", label: "Multiple choice (MCQ)" },
```

Old (line 995):
```tsx
  { value: "image", label: "Image MCQ" },
```
New:
```tsx
  { value: "image", label: "Multiple choice with image (Image MCQ)" },
```

- [ ] **Step 2: Psychometric/rating info box**

Old (lines 1478-1481):
```tsx
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question type always awards base points on any answer —
                there is no wrong answer.
              </p>
```
New:
```tsx
              <p className="rounded-lg bg-purple-50 px-3.5 py-2.5 text-xs text-purple-700 ring-1 ring-purple-200">
                This question type always awards full points, no matter what the candidate answers — there&apos;s no wrong answer here.
              </p>
```

- [ ] **Step 3: Base points → Points for a correct answer**

Old (lines 1498-1509):
```tsx
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Base points
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={qPoints}
                  onChange={(e) => setQPoints(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
```
New:
```tsx
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Points for a correct answer
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  value={qPoints}
                  onChange={(e) => setQPoints(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Points earned for answering this question correctly.
                </p>
              </div>
```

- [ ] **Step 4: Speed bonus max → Speed bonus (up to)**

Old (lines 1511-1522):
```tsx
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Speed bonus max
                </label>
                <input
                  type="number"
                  min={0}
                  value={qSpeedBonus}
                  onChange={(e) => setQSpeedBonus(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
              </div>
```
New:
```tsx
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#0F172A]">
                  Speed bonus (up to)
                </label>
                <input
                  type="number"
                  min={0}
                  value={qSpeedBonus}
                  onChange={(e) => setQSpeedBonus(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6366F1]"
                />
                <p className="mt-1 text-xs text-[#64748B]">
                  Extra points for answering quickly, on top of the points above. Set to 0 to turn off speed bonus for this question.
                </p>
              </div>
```

- [ ] **Step 5: Negative-marking badge**

Old (line 1227):
```tsx
                        −marking
```
New:
```tsx
                        Negative marking
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Manual verification**

On the Questions tab: open "Add question", confirm the type dropdown shows the spelled-out MCQ labels, confirm Points/Speed bonus fields show new labels + helper text, and confirm the negative-marking badge on an existing question with negative marking reads "Negative marking" instead of "−marking".

- [ ] **Step 8: Commit**

```bash
git add "app/admin/campaigns/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
docs(copy): plain-language rewrite of the Questions tab

Spells out MCQ on first reference, drops "base points" jargon in
favor of plain field names + helper text, and replaces the cryptic
"−marking" badge with "Negative marking".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Live Session page wording

**Files:**
- Modify: `app/admin/session/page.tsx`

**Interfaces:**
- Consumes: `candidateStatusLabel` from `lib/labels.ts` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

Add near the top of `app/admin/session/page.tsx`:
```ts
import { candidateStatusLabel } from "@/lib/labels";
```

- [ ] **Step 2: Fix the candidate status badge**

Old (line 235):
```tsx
                      }`}>{c.status}</span>
```
New:
```tsx
                      }`}>{candidateStatusLabel(c.status)}</span>
```

- [ ] **Step 3: Find and update the "End Session" confirm text**

Search for the end-session confirm string:
```bash
grep -n "End session" app/admin/session/page.tsx
```
Update the matched string from:
```
End session "${name}"? Candidates will be notified.
```
to:
```
End "${name}"? Candidates still taking the exam will be logged out immediately and their exam ends.
```
(Keep the surrounding template-literal syntax exactly as found — only the message text changes.)

- [ ] **Step 4: Broadcast field — add caption**

Search for the broadcast textarea (placeholder `"Broadcast message to all candidates…"`) and add a one-line caption immediately after it, matching the existing helper-text style used elsewhere on this page (`text-xs text-[#64748B]`):
```tsx
<p className="text-xs text-[#64748B] mt-1">Appears instantly on every candidate's screen for this campaign.</p>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Deploy a campaign to LIVE, open `/admin/session`, confirm candidate statuses show plain labels, click "End Session" and confirm the new confirm-dialog wording, and confirm the broadcast field shows the new caption.

- [ ] **Step 7: Commit**

```bash
git add app/admin/session/page.tsx
git commit -m "$(cat <<'EOF'
docs(copy): plain-language rewrite of the Live Session page

Candidate status badges use the shared label map, the End Session
confirm now states candidates are logged out mid-exam, and the
broadcast field explains its scope (this campaign only).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Campaigns list page + results page status labels

**Files:**
- Modify: `app/admin/campaigns/page.tsx:73-75`
- Modify: `app/admin/campaigns/[id]/results/page.tsx:531`

**Interfaces:**
- Consumes: `campaignStatusLabel`, `candidateStatusLabel` from `lib/labels.ts` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Campaigns list page**

Add the import near the top of `app/admin/campaigns/page.tsx`:
```ts
import { campaignStatusLabel } from "@/lib/labels";
```

Old (lines 73-75):
```tsx
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                {c.status}
              </span>
```
New:
```tsx
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                {campaignStatusLabel(c.status)}
              </span>
```

- [ ] **Step 2: Results page**

Add the import near the top of `app/admin/campaigns/[id]/results/page.tsx`:
```ts
import { candidateStatusLabel } from "@/lib/labels";
```

Old (lines 525-532):
```tsx
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              CANDIDATE_STATUS_STYLES[c.status] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.status}
                          </span>
```
New:
```tsx
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              CANDIDATE_STATUS_STYLES[c.status] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {candidateStatusLabel(c.status)}
                          </span>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open `/admin/campaigns` and confirm each campaign card shows a plain status label. Open the results page for an ended campaign with candidates and confirm the status column shows plain labels.

- [ ] **Step 5: Commit**

```bash
git add app/admin/campaigns/page.tsx "app/admin/campaigns/[id]/results/page.tsx"
git commit -m "$(cat <<'EOF'
docs(copy): use shared status labels on campaigns list and results pages

Last two remaining raw-enum render sites found in the audit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Global settings page wording

**Files:**
- Modify: `app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: Speed bonus warning — drop raw field name**

Old (line 196):
```tsx
                warning="Speed bonus is disabled globally — per-question speedBonusMax is ignored."
```
New:
```tsx
                warning="Speed bonus is turned off for every campaign — each question's individual speed bonus setting is ignored."
```

- [ ] **Step 2: Geo-restriction helper — drop standard name**

Old (line 265):
```tsx
                  Comma-separated ISO 3166-1 alpha-2 codes. Candidates with no country recorded are always blocked when restriction is active.
```
New:
```tsx
                  Comma-separated two-letter country codes (e.g. CA, US, GB). Candidates with no country on record are always blocked when this is active.
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open `/admin/settings`, turn off "Speed bonus" and confirm the new warning text appears; check the geo-restriction helper text.

- [ ] **Step 5: Commit**

```bash
git add app/admin/settings/page.tsx
git commit -m "$(cat <<'EOF'
docs(copy): drop raw field name and standard-name jargon from settings page

speedBonusMax no longer leaks into the speed-bonus warning; the
geo-restriction helper explains the format instead of naming
ISO 3166-1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Branding preview fix

**Files:**
- Modify: `app/admin/branding/page.tsx:63`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: Fix the mocked login field list**

Old (line 63):
```tsx
        {["Roll Number", "Email", "Password"].map((label) => (
```
New:
```tsx
        {["Access ID", "Password"].map((label) => (
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Open `/admin/branding`, confirm the login preview mock now shows "Access ID" and "Password" fields only — matching the real candidate login form at `/candidate/login`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/branding/page.tsx
git commit -m "$(cat <<'EOF'
fix: branding preview now matches the real candidate login form

The preview mocked "Roll Number, Email, Password" fields that don't
exist on the actual login screen (which only asks for Access ID and
Password) — a leftover from the deleted Roll-Number flow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Candidate login + waiting-room copy

**Files:**
- Modify: `app/candidate/login/page.tsx`
- Modify: `app/candidate/waiting-room/page.tsx:177`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new.

- [ ] **Step 1: Access ID format helper**

Old (lines 63-73):
```tsx
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
```
New:
```tsx
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
              <p className="mt-1 text-xs text-[#64748B]">
                Format: 4 letters, a dash, then 6 digits — e.g. RELA-000001. This was sent to you by email.
              </p>
            </div>
```

- [ ] **Step 2: Waiting room heading — match "assessment" terminology**

Old (line 177):
```tsx
Your session hasn't started yet
```
New:
```tsx
Your assessment hasn't started yet
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open `/candidate/login` and confirm the new helper text appears under the Access ID field. Join a scheduled-but-not-started campaign and confirm the waiting room heading now says "assessment" instead of "session".

- [ ] **Step 5: Commit**

```bash
git add app/candidate/login/page.tsx app/candidate/waiting-room/page.tsx
git commit -m "$(cat <<'EOF'
docs(copy): candidate login format hint + consistent "assessment" wording

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Tab-switch warning shows the real limit

**Files:**
- Modify: `components/exam/TabSwitchModal.tsx`
- Modify: `app/candidate/exam/page.tsx` (handleTabSwitch + showWarning state + render)

**Interfaces:**
- Consumes: `{ count, limit }` from the existing `POST /api/candidate/tab-switch` JSON response (`app/api/candidate/tab-switch/route.ts`, already returns `{ count, limit, disqualified }` — no backend change needed).
- Produces: `TabSwitchModal` now takes `count: number`, `limit: number` props in addition to `onClose`.

- [ ] **Step 1: Update TabSwitchModal to accept and display real numbers**

Replace the full contents of `components/exam/TabSwitchModal.tsx`:
```tsx
// components/exam/TabSwitchModal.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  count: number;
  limit: number;
  onClose: () => void;
}

export default function TabSwitchModal({ count, limit, onClose }: Props) {
  const [seconds, setSeconds] = useState(10);
  const remaining = Math.max(limit - count, 0);

  useEffect(() => {
    if (seconds === 0) { onClose(); return; }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-gray-900 border border-yellow-500 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-yellow-400 text-xl font-bold mb-2">Tab Switch Detected</h2>
        <p className="text-gray-300 mb-6">
          Warning: you switched tabs (<span className="text-yellow-400 font-semibold">{count} of {limit} allowed</span>).{" "}
          {remaining > 0
            ? `${remaining} more will end your exam automatically.`
            : "One more will end your exam automatically."}
        </p>
        <div className="text-5xl font-mono font-bold text-yellow-400">{seconds}</div>
        <p className="text-gray-500 text-sm mt-2">This warning closes automatically</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Capture count/limit in the exam page and pass them through**

In `app/candidate/exam/page.tsx`, find the `showWarning` state declaration (search for `useState` near `showWarning`) and add a companion state for the tab-switch info:

Old:
```tsx
  const [showWarning, setShowWarning] = useState(false);
```
New:
```tsx
  const [showWarning, setShowWarning] = useState(false);
  const [tabSwitchInfo, setTabSwitchInfo] = useState({ count: 0, limit: 0 });
```

Then update `handleTabSwitch` (around lines 211-232) to capture the response instead of discarding it:

Old:
```tsx
    const handleTabSwitch = async () => {
      if (!settingsRef.current.antiCheatTabSwitch) return;
      try {
        const res = await fetch("/api/candidate/tab-switch", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.disqualified) {
          sessionStorage.setItem(
            "disqualifyReason",
            data.disqualifyReason ?? `Disqualified: exceeded tab switch limit.`
          );
          disconnectSocket();
          router.push("/candidate/disqualified");
          return;
        }
      } catch {
        // network error — still emit socket event so admin can see it
      }
      socket.emit(SocketEvents.TAB_SWITCH);
    };
```
New:
```tsx
    const handleTabSwitch = async () => {
      if (!settingsRef.current.antiCheatTabSwitch) return;
      try {
        const res = await fetch("/api/candidate/tab-switch", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.disqualified) {
          sessionStorage.setItem(
            "disqualifyReason",
            data.disqualifyReason ?? `Disqualified: exceeded tab switch limit.`
          );
          disconnectSocket();
          router.push("/candidate/disqualified");
          return;
        }
        setTabSwitchInfo({ count: data.count, limit: data.limit });
      } catch {
        // network error — still emit socket event so admin can see it
      }
      socket.emit(SocketEvents.TAB_SWITCH);
    };
```

- [ ] **Step 3: Pass the new props at the render site**

Old (line 361):
```tsx
      {showWarning && <TabSwitchModal onClose={() => setShowWarning(false)} />}
```
New:
```tsx
      {showWarning && (
        <TabSwitchModal
          count={tabSwitchInfo.count}
          limit={tabSwitchInfo.limit}
          onClose={() => setShowWarning(false)}
        />
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors (this will fail loudly if the prop shapes don't line up, which is the point of doing this step).

- [ ] **Step 5: Manual verification**

Set a campaign's "Tab switch limit" to 3 (via Settings tab), join as a test candidate, switch away from the exam tab once, and confirm the modal reads "you switched tabs (1 of 3 allowed)" and "2 more will end your exam automatically" — not a hardcoded "first and final warning". Switch again and confirm the count updates to 2 of 3.

- [ ] **Step 6: Commit**

```bash
git add components/exam/TabSwitchModal.tsx app/candidate/exam/page.tsx
git commit -m "$(cat <<'EOF'
fix: tab-switch warning now shows the real configured limit

The modal previously hardcoded "first and final warning" regardless
of the campaign's tabSwitchLimit setting, which was factually wrong
for any campaign configured to allow more than one switch. The real
count/limit already came back from POST /api/candidate/tab-switch
but were discarded before reaching the modal — now captured in state
and passed through as props.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Candidate messaging cleanup (BroadcastToast, disqualified page)

**Files:**
- Modify: `components/exam/BroadcastToast.tsx:40`
- Modify: `app/candidate/disqualified/page.tsx`
- Modify: `app/candidate/exam/page.tsx:71`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — `REASON_LABELS` removed as dead code.

- [ ] **Step 1: BroadcastToast label**

Old (line 40):
```tsx
        Message from admin
```
New:
```tsx
        Announcement
```

- [ ] **Step 2: Fix the bare lowercase fallback default**

Old (`app/candidate/exam/page.tsx:71`):
```tsx
      let reason = "disqualified";
```
New:
```tsx
      let reason = "Your assessment was ended for a policy violation.";
```

- [ ] **Step 3: Simplify the disqualified page — remove redundant raw-code box**

Every current producer of the `disqualifyReason` sessionStorage value already sends a complete, readable sentence by the time it reaches this page (duplicate-login: `"Duplicate login detected — assessment rules prohibit logging in from multiple devices."`; tab-switch: `` `Disqualified: exceeded tab switch limit (${limit} allowed).` ``; next-question 403: `"You have been disqualified from this assessment"` or the geo-restricted sentence, pre-translated client-side; and the new default from Step 2 above). The `REASON_LABELS` short-code map and the raw monospace box are dead weight that only ever duplicated the message already shown.

Replace the full contents of `app/candidate/disqualified/page.tsx`:
```tsx
"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

function subscribeNoop() {
  return () => {};
}
function getReason() {
  return sessionStorage.getItem("disqualifyReason");
}
function getReasonServer() {
  return null;
}

export default function DisqualifiedPage() {
  const reason = useSyncExternalStore(subscribeNoop, getReason, getReasonServer);

  const message = reason || "Your session was ended by the proctor.";

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 border border-red-100">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <span className="inline-block rounded-full border border-red-200 bg-red-50 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-600">
          Disqualified
        </span>

        <h1 className="mt-3 text-xl font-semibold text-[#0F172A]">
          Your assessment has ended
        </h1>
        <p className="mt-2 text-sm text-[#64748B] max-w-xs mx-auto">
          {message}
        </p>

        <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-4 text-left">
          <p className="text-xs font-semibold text-[#0F172A] mb-2">What happened?</p>
          <p className="text-xs text-[#64748B]">
            Our proctoring system detected activity that violated the assessment rules.
            If you believe this is an error, please contact your assessment organiser.
          </p>
        </div>

        <Link
          href="/candidate/login"
          className="mt-4 inline-block text-xs text-[#64748B] hover:text-[#2E0BFC] underline-offset-2 hover:underline"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Trigger a duplicate-login disqualification (log in as the same candidate from two browser sessions) and confirm the disqualified page shows one clean readable sentence with no raw monospace code box beneath it. Trigger a tab-switch disqualification (exceed the configured limit) and confirm the same.

- [ ] **Step 6: Commit**

```bash
git add components/exam/BroadcastToast.tsx app/candidate/disqualified/page.tsx app/candidate/exam/page.tsx
git commit -m "$(cat <<'EOF'
docs(copy): candidate-facing messaging cleanup

"Message from admin" -> "Announcement" (drops internal-facing term).
Disqualified page no longer shows the same reason twice (once as a
friendly sentence, once again as a raw code) — every producer of the
reason already sends a complete sentence, so the redundant
REASON_LABELS translation table and raw-code box are removed. Fixes
the one remaining bad default ("disqualified", lowercase, no
punctuation) to a proper sentence.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final verification sweep

**Files:** none (verification only)

**Interfaces:**
- Consumes: the full state of the repo after Tasks 1-14.
- Produces: confidence the whole pass is internally consistent.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p .`
Expected: zero errors.

- [ ] **Step 2: Confirm no references to deleted files remain**

```bash
grep -rn "CandidateGrid\|SessionControls\|session/new\|/api/admin/candidates\b" --include="*.ts" --include="*.tsx" .
```
Expected: no matches (the sidebar's link to `/admin/session` — the real Live Session page — is a different path and should not match this pattern; if it does appear, confirm it's `/admin/session` and not `/admin/session/new` before treating it as a problem).

Also confirm the deleted directory is gone:
```bash
ls app/admin/session/new 2>&1 || echo "confirmed deleted"
```

- [ ] **Step 3: Confirm REASON_LABELS is fully gone**

```bash
grep -rn "REASON_LABELS\|TAB_SWITCH_2\|PAGE_REFRESH" --include="*.tsx" .
```
Expected: no matches.

- [ ] **Step 4: Full manual walkthrough**

Using the dev server, exercise in order:
1. `/admin` — Dashboard shows only KPI cards + Campaigns table with correct statuses.
2. `/admin/campaigns/new` — full wizard, all 4 steps, new copy visible throughout.
3. An existing campaign's Overview/Settings tab — Go live button, Candidate limit, Penalty for wrong answers, Block duplicate logins, Late join window, Tab switch limit.
4. Questions tab — add a question, confirm MCQ label spelled out, Points/Speed bonus fields with helper text.
5. Candidates tab — manual add (credentials note), CSV import (helper text), remove-all confirm.
6. Deploy a campaign, open `/admin/session` — status labels, End Session confirm, broadcast caption.
7. `/admin/settings` — speed bonus warning, geo-restriction helper.
8. `/admin/branding` — login preview shows Access ID/Password only.
9. Candidate flow: login page format hint, waiting room "assessment" wording, tab-switch warning with real numbers, a disqualification reaching the disqualified page with one clean message.

- [ ] **Step 5: No commit needed** — this task is verification-only; if any issue is found, fix it as part of the task where it was introduced and re-commit there.
