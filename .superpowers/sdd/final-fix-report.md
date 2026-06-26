# Final Fix Report — 2026-06-26

## Changes

### C1 (Critical): session-stats cache-first
**File:** `app/api/candidate/session-stats/route.ts`

Removed the unnecessary `prisma.candidate.findUnique` call that fired on every request before the cache check. `campaignId` is already available in the JWT payload via `verifyToken(token)`, so we now extract it directly and check the Redis cache before touching the DB at all. Cache hit cost: ~1ms Redis lookup. Cache miss cost: 4 parallel DB queries (unchanged).

### C2 (Critical): candidate Redis key TTL
**File:** `socket-server/src/state.ts`

Added `await redis.expire(`candidate:${candidateId}`, 86400)` immediately after the `hset` in `addCandidate`. Without this, hash keys accumulate indefinitely if the socket server crashes before explicit cleanup. 24-hour TTL matches the maximum JWT lifetime (8h with slack).

### m1 (Minor): broadcast route safe Bearer strip
**File:** `app/api/candidate/broadcast/route.ts`

Replaced `?.slice(7)` with the guard pattern used elsewhere: checks `startsWith("Bearer ")` before slicing. Previously a non-Bearer auth header (e.g., `Basic ...`) would silently pass a mangled token to `verifyToken` instead of returning 401.

### m2 (Minor): tab-switch disqualify exactness
**File:** `socket-server/src/anticheat.ts`

Changed `count >= 2` to `count === 2` in `handleTabSwitch`. The old code re-invoked `disqualifyCandidate` on the 3rd, 4th, 5th … tab switch, emitting duplicate `disqualified` events and firing redundant DB updates. Now it fires exactly once.

## Test Results

```
socket-server: 6/6 tests passed (1.974s)
```

## Build Result

```
Next.js build: PASS (Turbopack, TypeScript clean, 37 static pages generated)
```
