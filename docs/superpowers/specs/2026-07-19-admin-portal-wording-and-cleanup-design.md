---
title: Admin & candidate portal — plain-language wording pass + legacy cleanup
date: 2026-07-19
status: approved (pending spec review)
---

# Admin & candidate portal — plain-language wording pass + legacy cleanup

## Goal

The admin side of the platform is used by non-technical HR staff, not engineers. Right now the copy leans on internal/technical vocabulary (e.g. "base points," "deploy," raw enum values like `DRAFT`), several fields have no explanation at all, and the same concept is worded differently in different places. Separately, the app carries a duplicate, broken pre-multi-campaign system (a "Roll Number"-based candidate flow and a dead "Live Session" dashboard panel) that actively misleads admins.

This pass:
1. Rewrites every admin- and candidate-facing label, placeholder, helper text, button, and message to plain language, with a short explanation under every field — targeting an HR professional with no technical background. Tone/reference point: TestGorilla, Moodle.
2. Removes the confirmed-broken/legacy pieces so the admin portal only contains things that actually work.
3. Fixes a small number of copy bugs that need a tiny logic change (raw status values shown as literal text; a candidate-facing warning that states the wrong number).

## Style guide (approved)

1. Every input field gets a plain-language label + one short helper sentence beneath it (muted, small text). No field is left to explain itself.
2. Numeric fields state the unit and blank/default behavior inline (e.g. "leave blank for no limit").
3. Toggles state the consequence of **both** ON and OFF in one line each, not a dense paragraph.
4. No unexplained jargon: "base points," "deploy," "fraction," raw field names (`speedBonusMax`), standards names ("ISO 3166-1"), and raw enum text (`DRAFT`, `ACTIVE`) are always translated to plain words.
5. One concept = one word, everywhere. Where two different settings currently share a name ("grace period" used for both a late-join window and a post-timer buffer), one is renamed to remove the collision.
6. Confirmations/errors state the real-world consequence ("their access ID and password stop working immediately"), not the internal action name.
7. Existing native `alert()`/`confirm()` calls stay mechanically as-is (no new modal components built in this pass) — only the text inside them changes.

## Part 1 — Legacy removal (confirmed broken/unused, verified against live code and DB)

Verified via code + a database query during this investigation: the real, currently-used flow is the multi-campaign system (`Campaign` model, Access ID, per-campaign Live Session page). The following is a separate, older, pre-multi-campaign implementation that the product owner confirmed is not used, and which is also independently confirmed broken:

**Delete entirely:**
- `app/admin/session/new/page.tsx` — posts to `/api/admin/session`, which has no backing route file (`app/api/admin/session/` does not exist anywhere in the codebase) → this page 404s on every submit. Also unreachable from any nav link in the app (orphaned route).
- `components/admin/SessionControls.tsx` — only consumer is the page above.
- `components/admin/CandidateGrid.tsx` — only consumer is the Dashboard home page (removed below).
- `app/api/admin/candidates/route.ts` — global, campaign-unscoped candidate list that relabels `accessId` as `rollNumber` in its response (this is the literal origin of the "Roll Number" terminology). Only consumer is the Dashboard home page (removed below). Becomes fully orphaned.

**Remove from `app/admin/page.tsx` (Dashboard home):**
- The "Live Session" card (Start/Pause/End buttons) — calls `/api/admin/session` for both status and actions; that route doesn't exist, so every button 404s silently (the `if (res.ok)` guard means the button just does nothing).
- The "Broadcast to candidates" card on this page — it works mechanically (real socket event), but sends to every candidate in every campaign at once, with no way to target one campaign. The correct, campaign-scoped version of this already exists on the real Live Session page (`app/admin/session/page.tsx`), which is being kept.
- The "Candidates" live grid table (`<CandidateGrid candidates={candidates} />`) — fed by the orphaned global endpoint above; mixes candidates from every campaign, including ended ones.
- The "New Session" button in the page header that links to `/admin/session` — redundant with the sidebar's existing "Live Session" nav link (`components/admin/AdminSidebar.tsx:21`), and its label ("New Session") is misleading since it doesn't create anything, it navigates to monitoring.
- Associated state/effects: `sessionStatus`, `runSessionAction`, `fetchCandidates`, `broadcastMsg`/`sendBroadcast`/`lastBroadcast`, and the `/api/admin/session` and `/api/admin/candidates` fetch calls in `useEffect`.

**Keep and fix on the Dashboard home page:**
- The KPI cards (Total Candidates, Active Now, Completed, Completion Rate) — legitimate, backed by the real `/api/admin/stats` route.
- The "Campaigns" table — legitimate (backed by real `/api/admin/campaigns`), but has an existing bug: **the status badge always shows "Inactive"** because the frontend checks `campaign.active`, a field the API never returns (the real field is `campaign.status`, e.g. `LIVE`/`ENDED`). Fix: use the shared status-label map (Part 3) against the real `status` field.

**Not touched, flagged only:** `app/api/admin/disqualify/route.ts` (manual disqualify-with-reason) becomes unreachable from the UI once `SessionControls.tsx` is deleted (it was the only caller). It's a small, working, harmless route — left in place as a known gap, not deleted. Re-exposing "manually disqualify a candidate" as a button on the real campaign Candidates tab is a reasonable future feature but is out of scope for this pass.

## Part 2 — Naming collision fix

"Grace period" currently names two unrelated settings:
- Global setting (`app/admin/settings/page.tsx`): extra seconds after the timer hits 0 before auto-submit.
- Per-campaign setting (`app/admin/campaigns/[id]/page.tsx`): how long after the scheduled start a candidate can still join.

The per-campaign one is renamed to **"Late join window"** to remove the collision. The global one keeps "Grace period after timer" (already unambiguous once the other is renamed).

## Part 3 — Shared status-label mapping (new, small utility)

New helper (e.g. `lib/labels.ts`) exporting two plain lookup objects/functions, used everywhere a status is currently rendered as raw enum text:

```
CAMPAIGN_STATUS_LABEL: DRAFT → "Not started", SCHEDULED → "Scheduled",
  LIVE → "Live now", PAUSED → "Paused", ENDED → "Ended"

CANDIDATE_STATUS_LABEL: REGISTERED → "Registered", JOINED → "Joined",
  ACTIVE → "In progress", COMPLETED → "Completed", DISQUALIFIED → "Disqualified"
```

Applied at every current raw-enum render site: campaign list/detail status badge, candidates table (admin campaign page), results table, Dashboard Campaigns table (also fixes the "always Inactive" bug by reading real `status` instead of the nonexistent `active` field).

## Part 4 — Field-by-field wording (by file)

### `app/admin/campaigns/new/page.tsx` (creation wizard)
| Field | Before | After |
|---|---|---|
| Campaign Name | "Campaign Name *", no helper | Keep label; add helper: "This is what candidates and your team will see — e.g. \"Java Developer Assessment.\"" |
| Logo URL | "Logo URL", no helper | Add helper: "Link to your company logo. Shown to candidates on the login and exam screens." |
| Background Colour | no helper | Add helper: "Background color candidates see behind your logo." |
| Scheduled Start | "Scheduled Start (optional)", no helper | Add helper: "When candidates can start joining. Leave blank to let them join anytime." |
| Auto-start toggle | "Auto-start at scheduled time" | Add helper: "On: the assessment goes live automatically at the scheduled time. Off: you'll click \"Go live\" yourself when ready." |
| Max Candidates | "Max Candidates", placeholder "e.g. 12000", no helper | Label **"Candidate limit"**; placeholder "e.g. 500 (leave blank for no limit)"; helper: "The most people who can be added to this assessment. Once reached, no one else can be added or join." |
| Negative marking toggle | "Enable negative marking", no helper | Add helper: "On: candidates lose points for wrong answers, not just skipped ones. Off: wrong and skipped answers both score zero." |
| Deduction fraction | "Deduction fraction (0.00–1.00)"; live text "Deduct {v}× base points per wrong answer" | Label **"Penalty for wrong answers"**; helper: "Candidates lose this fraction of a question's points for each wrong answer." Live text: "A wrong answer costs {v} of that question's points — e.g. 0.25 means losing a quarter." |
| Step 3 note | "You can add questions from the Manage page after finishing setup." | "Questions aren't added here — you'll add them from the campaign's Questions tab after finishing this setup." |
| Step 4 note | "Import candidates from the Manage page, or finish setup now." | "You can add candidates now from the campaign page, or come back to it later." |

### `app/admin/campaigns/[id]/page.tsx` — Overview / Settings tab
| Field | Before | After |
|---|---|---|
| Deploy button | "Deploy Campaign" | **"Go live"**; add helper under it: "Once live, candidates can join using the link below and start their assessment." |
| Max candidates | "Max candidates", placeholder "Unlimited", no helper | Label **"Candidate limit"**; add helper (same as wizard). |
| Deduction fraction | "Deduction fraction (e.g. 0.25 = ¼ of base points)" | Same rewrite as wizard — unify wording between the two screens. |
| Disqualify on duplicate login | Existing helper already states both ON/OFF but as one dense sentence | Label **"Block duplicate logins"**; tighten to two clear clauses: "On: a second login disqualifies the candidate and ends both sessions immediately. Off: the second device is blocked, but the original session keeps running." |
| Candidate entry grace period | "Candidate entry grace period" | Renamed **"Late join window"** (see Part 2); keep existing helper text, keep "No late entry" button label (now consistent with the new name). |
| Tab switch limit | "Disqualify after this many switches. 0 = disqualify on 1st switch." | "Number of tab switches allowed before disqualifying the candidate. Set to 0 to disqualify on the very first switch." |
| Anti-cheat toggles (Fullscreen, copy/paste, right-click, screenshot, DevTools) | Already have concise helper text — reviewed and are already acceptable | No change needed; these already meet the style guide. |
| Shuffle question/answer toggles | Already have clear helper text | No change needed. |
| Pre-exam instructions | Already explains allowed HTML tags with examples | Minor polish only: reframe opening as "Optional — shown to candidates before they start." to make clear it's not required. |
| Status badges | Raw `DRAFT`/`SCHEDULED`/`LIVE`/`PAUSED`/`ENDED` | Use shared label map (Part 3). |
| Candidate status column | Raw `REGISTERED`/`JOINED`/`ACTIVE`/`COMPLETED`/`DISQUALIFIED` | Use shared label map (Part 3). |
| Save-failure alert | `alert(d.error ?? "Failed to save")` | `alert(d.error ?? "We couldn't save your changes. Please try again.")` |
| Deploy-failure alert | `alert(d.error ?? "Failed to deploy campaign")` | `alert(d.error ?? "We couldn't take this campaign live. Please try again.")` |
| Delete question confirm | `"Delete this question?"` | `"Delete this question? This can't be undone, and any existing candidate answers to it will be lost."` |
| Remove candidate confirm | `"Remove this candidate?"` | `"Remove this candidate? Their access ID and password will stop working immediately."` |
| Remove-all confirm | `"Remove all {candidates.length}?"` | `"Remove all {candidates.length} candidates? This can't be undone."` |
| One-time credentials note | "One-time credentials — save these now" | Add helper line: "You won't be able to see this password again after you leave this page — copy or download it now." |
| CSV helper text | "Columns required: name, email" | "Your file needs two columns: name and email (any order, header names aren't case-sensitive). We'll generate a unique access ID and password for each row automatically." |
| Manual-add/import catch-block errors | "Failed to add candidate — check your connection and try again" / "Import failed — check your connection and try again" | Soften to not over-claim cause: "Something went wrong adding this candidate. Please check your connection and try again." (equivalent for import) |

### Questions tab
| Field | Before | After |
|---|---|---|
| Base points | "Base points", no helper | Label **"Points for a correct answer"**; helper: "How many points a candidate earns for answering this question correctly." |
| Speed bonus max | "Speed bonus max", no helper | Label **"Speed bonus (up to)"**; helper: "Extra points for answering quickly, on top of the points above. Set to 0 to turn off speed bonus for this question." |
| MCQ / Image MCQ type labels | "MCQ", "Image MCQ" (acronym never spelled out) | "Multiple choice (MCQ)", "Multiple choice with image (Image MCQ)" |
| Psychometric/rating info box | "This question type always awards base points on any answer — there is no wrong answer." | "This question type always awards full points, no matter what the candidate answers — there's no wrong answer here." |
| Negative-marking badge | `−marking` (cryptic minus-sign shorthand) | "Negative marking" (small pill, full words) |

### Candidates tab
Covered above (CSV helper, credentials note, confirms, catch-block errors).

### `app/admin/session/page.tsx` (real Live Session monitoring screen)
| Item | Before | After |
|---|---|---|
| End session confirm | `` `End session "${name}"? Candidates will be notified.` `` | `` `End "${name}"? Candidates still taking the exam will be logged out immediately and their exam ends.` `` |
| Broadcast placeholder | "Broadcast message to all candidates…" | Keep, add a one-line caption beneath: "Appears instantly on every candidate's screen for this campaign." |

### `app/admin/settings/page.tsx` (global settings)
| Field | Before | After |
|---|---|---|
| Speed bonus warning | "Speed bonus is disabled globally — per-question speedBonusMax is ignored." | "Speed bonus is turned off for every campaign — each question's individual speed bonus setting is ignored." |
| Geo-restriction helper | "Comma-separated ISO 3166-1 alpha-2 codes. Candidates with no country recorded are always blocked when restriction is active." | "Comma-separated two-letter country codes (e.g. CA, US, GB). Candidates with no country on record are always blocked when this is active." |
| Grace period after timer | Already clear plain-language helper | No change (name now unambiguous after Part 2 rename). |

### `app/admin/branding/page.tsx`
| Item | Before | After |
|---|---|---|
| Login preview mock fields | `["Roll Number", "Email", "Password"]` — doesn't match the real candidate login form at all | `["Access ID", "Password"]` — matches the actual candidate login screen exactly. |

### Candidate-facing screens
| Screen | Item | Before | After |
|---|---|---|---|
| `app/candidate/login/page.tsx` | Access ID field | Placeholder "RELA-000001" is the only format hint | Add static helper beneath the field: "Format: 4 letters, a dash, then 6 digits — e.g. RELA-000001." |
| `app/candidate/waiting-room/page.tsx` | Heading | "Your session hasn't started yet" | "Your assessment hasn't started yet" (match "assessment" used everywhere else candidate-facing) |
| `components/exam/TabSwitchModal.tsx` | Hardcoded warning | "This is your first and final warning. Switching tabs again will immediately disqualify you." — wrong whenever the campaign allows more than 1 switch | Component now receives the real switch count and configured limit as props. `handleTabSwitch` in `app/candidate/exam/page.tsx` already calls `POST /api/candidate/tab-switch`, whose JSON response is `{ count, limit, disqualified }` — today `count`/`limit` are read only to check `disqualified` and then discarded before `setShowWarning(true)` fires via the socket round-trip. Small logic change: store `{ count, limit }` from that response in state and pass to `<TabSwitchModal>` instead of relying on the bare socket trigger. New copy: "Warning: you switched tabs ({count} of {limit} allowed). {remaining} more will end your exam automatically." |
| `components/exam/BroadcastToast.tsx` | Label | "Message from admin" | "Announcement" |
| `app/candidate/disqualified/page.tsx` | Redundant raw-code box | Shows the friendly message AND, right below it, the same reason again in a raw monospace box — doubly bad when the reason is an unmapped code | Every current producer of this reason string (duplicate-login, tab-switch limit, next-question 403, geo-restriction) already sends a complete, readable sentence by the time it reaches this page. Remove the redundant monospace box and the now-unnecessary `REASON_LABELS` translation table; display `reason` directly. Fix the one remaining bad default (`"disqualified"`, lowercase, in `app/candidate/exam/page.tsx:71`) to `"Your assessment was ended for a policy violation."` |

## Part 5 — Out of scope (explicit)

- No new UI mechanics: `alert()`/`confirm()` stay as native browser dialogs (text only changes); no rich-text editor added for pre-exam instructions; no downloadable CSV template file added.
- `app/api/admin/disqualify/route.ts` is not deleted, and manual-disqualify-with-reason is not re-added to the real UI — noted as a future feature, not this pass.
- No visual/casing convention changes (Title Case labels stay Title Case) — this pass is wording and explanations only, not a visual redesign.

## Verification plan

- `npx tsc --noEmit` after all edits (this repo has no test suite).
- Manually exercise: campaign creation wizard end-to-end, campaign settings save, manual candidate add, CSV import, Dashboard home page (confirm removed sections are gone and status badges show real values), a live campaign's tab-switch warning with `tabSwitchLimit` set to a value >1 (confirm the copy reflects the real limit, not a hardcoded "final warning"), and the disqualified page for at least the geo-restriction and duplicate-login paths.
- Confirm `app/admin/session/new`, `SessionControls.tsx`, `CandidateGrid.tsx`, and `app/api/admin/candidates/route.ts` have zero remaining references after deletion (`grep` sweep).
