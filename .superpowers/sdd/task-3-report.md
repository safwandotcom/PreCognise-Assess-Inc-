# Task 3 Report: Candidate Management API

**Status:** DONE

## Commits
- `7a26a91` feat: candidate management API — list, add, bulk import, delete

## Files Created
- `app/api/admin/campaigns/[id]/candidates/route.ts` — GET list, POST add single candidate
- `app/api/admin/campaigns/[id]/candidates/import/route.ts` — POST bulk import
- `app/api/admin/campaigns/[id]/candidates/[candidateId]/route.ts` — DELETE single candidate

## Type Check
`npx tsc --noEmit` — new files produce zero TypeScript errors. All errors reported are pre-existing in legacy session-based routes (`app/api/admin/session/[id]/candidates/route.ts`, `app/api/admin/candidates/route.ts`, etc.) that reference removed fields (`sessionId`, `rollNumber`) — scheduled for cleanup in Task 11.

## Implementation Notes
- Single-add POST: uses `makeAccessId(campaign.name, count + 1)` for sequence
- Bulk import POST: batches bcrypt in groups of 100, seq formula `existingCount + i + j + 1`, uses `createMany` with `skipDuplicates: true`, returns credentials with plaintext passwords
- DELETE: simple delete by candidateId (no campaign cross-check — admin-only endpoint)
- In-file duplicate email detection returns row numbers for UX feedback

## Fix Pass (Important Issues)

**Status:** DONE

### Fixes Applied
1. **Fix 1 — `$transaction` wrap**: Wrapped `createMany` in `prisma.$transaction` in `candidates/import/route.ts`; removed `skipDuplicates: true`.
2. **Fix 2 — Cumulative maxCandidates check**: Moved cap check after `existingCount` query; now checks `(existingCount + rows.length) > campaign.maxCandidates` with a 422 response citing current count.
3. **Fix 3 — DB duplicate email check**: Added `prisma.candidate.findMany` lookup for emails already in the campaign before hashing; returns 422 listing the conflicting addresses.
4. **Fix 4 — Campaign ownership check in DELETE**: `candidateId` route now fetches the candidate first, returns 404 if missing or if `campaignId` doesn't match the URL `id`.
5. **Fix 5 — maxCandidates check in single-add POST**: Added `if (campaign.maxCandidates && count >= campaign.maxCandidates)` guard returning 422 before proceeding.

### Type Check
Zero errors in the three touched files. Pre-existing errors in unrelated legacy routes (`session/[id]/candidates/*`, `admin/candidates/route.ts`, etc.) are out of scope for this task.
