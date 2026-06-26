# Phase 2: Scale Hardening — Design Spec

**Date:** 2026-06-26
**Status:** Approved
**Scope:** Gap analysis items 4, 5, 6

---

## Overview

This spec covers three changes needed before the platform can handle 15–20k concurrent candidates (RBC exam scale):

1. **Gap 4** — Replace in-process Socket.IO state with Redis-backed state + Redis adapter for horizontal scaling
2. **Gap 5** — Add Redis cache in front of two high-frequency DB polling endpoints
3. **Gap 6** — Write a k6 load test script that validates the hardened stack under realistic 15k-candidate load

---

## Infrastructure

One Railway project hosts two services:

- **Redis** — Railway's managed Redis template. Exposed to other Railway services via `$REDIS_URL` (internal private network URL).
- **Socket server** — existing Node.js service (`socket-server/`). Gets `REDIS_URL` added to its environment.

The Next.js app on Vercel also receives `REDIS_URL` as a production environment variable (for gap 5 caching).

**New env var required in both Railway (socket server) and Vercel (Next.js):**
```
REDIS_URL=redis://default:<password>@<host>:<port>
```

---

## Gap 4 — Socket.IO Redis Adapter + Redis State

### Problem

`socket-server/src/state.ts` holds all candidate state in a Node.js process-level `Map` and `Set`. Socket.IO rooms (`candidates`, `admins`, per-candidate private rooms) are also in-process. This means:

- A second socket server replica cannot see candidates connected to the first
- Anti-cheat tab-switch counts are per-process — a reconnect to a different replica resets the count
- The platform cannot scale horizontally

### Solution

Two changes in tandem:

#### 1. Attach `@socket.io/redis-adapter` in `socket-server/src/index.ts`

After `const io = new Server(...)`:

```ts
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";

const pubClient = new IORedis(process.env.REDIS_URL!);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

This makes all Socket.IO rooms — including `candidates`, `admins`, and each candidate's private room — shared across replicas via Redis pub/sub. `io.to("candidates").emit(...)` and `io.to("admins").emit(...)` will reach sockets on any replica.

#### 2. Rewrite `socket-server/src/state.ts` to use Redis

Replace the in-memory `Map<string, CandidateState>` and `Set<string>` with async Redis operations via `ioredis`.

**Redis key schema:**

| Key | Type | Fields |
|-----|------|--------|
| `candidate:{candidateId}` | Hash | `socketId`, `accessId`, `tabSwitchCount`, `status` |
| `admin:sockets` | Set | socket ID strings |

All existing exported function signatures are preserved. Bodies become async:

```ts
export async function addCandidate(candidateId: string, socketId: string, accessId: string): Promise<void>
export async function removeCandidate(candidateId: string): Promise<void>
export async function getCandidate(candidateId: string): Promise<CandidateState | undefined>
export async function updateStatus(candidateId: string, status: CandidateState["status"]): Promise<void>
export async function incrementTabSwitch(candidateId: string): Promise<number>
export async function addAdminSocket(socketId: string): Promise<void>
export async function removeAdminSocket(socketId: string): Promise<void>
export async function getAdminSockets(): Promise<string[]>
```

`incrementTabSwitch` uses Redis `HINCRBY candidate:{id} tabSwitchCount 1` which is atomic — safe across concurrent replicas.

#### 3. Replace socketId-based emit with room-based emit in `anticheat.ts`

`io.to(candidate.socketId).emit("disqualified", ...)` becomes `io.to(candidateId).emit("disqualified", ...)`.

This works because `index.ts` already puts each candidate in their own private room: `socket.join(payload.candidateId)`. With the Redis adapter attached, this room is shared across replicas, so the emit reaches the correct socket regardless of which replica it's connected to.

The `candidate.socketId` field in `CandidateState` can be retained in the hash for potential future debugging use, but is no longer used for emit routing.

#### 4. Update all callers to `await` async state functions

`handlers.ts` and `anticheat.ts` call state functions — all call sites get `await`. Since these are already inside Socket.IO event handlers (which are async-safe), no structural changes are needed.

#### New packages (socket-server)

```
ioredis
@socket.io/redis-adapter
```

---

## Gap 5 — Redis Cache for Polling Endpoints

### Problem

At 15k candidates:
- `/api/candidate/broadcast` polled every 20s → **750 req/s**
- `/api/candidate/session-stats` polled every 10s → **1,500 req/s**

Both hit Neon PostgreSQL on every request. `session-stats` runs 4 queries per request (campaign name + 3 COUNT queries). Combined: ~7,000 DB queries/sec at peak, well beyond Neon's serverless connection limits.

### Solution

**New file: `lib/redis.ts`**

Global ioredis singleton, mirroring the `lib/prisma.ts` pattern used in the codebase:

```ts
import IORedis from "ioredis";

declare global { var redis: IORedis | undefined; }

export const redis = global.redis ?? new IORedis(process.env.REDIS_URL!);
if (process.env.NODE_ENV !== "production") global.redis = redis;
```

**Cache layer in `/api/candidate/broadcast`**

- Cache key: `broadcast:{campaignId}`, TTL: 15s
- On hit: return cached JSON directly (skip DB)
- On miss: run existing Prisma query, `redis.set(key, JSON.stringify(result), "EX", 15)`, return result
- The JWT token → `campaignId` extraction step is NOT cached (single fast lookup, and cached tokens could mask campaign changes)

**Cache layer in `/api/candidate/session-stats`**

- Cache key: `session-stats:{campaignId}`, TTL: 15s
- On hit: return cached JSON directly
- On miss: run existing 4 Prisma queries, cache result, return
- The JWT → `candidateId` → `campaignId` lookup is NOT cached (same reason)

**Load reduction at 15k candidates:**

| Endpoint | Before | After (15s TTL) | Reduction |
|----------|--------|-----------------|-----------|
| broadcast | 750 req/s → 750 DB reads/s | 750 req/s → ~4 DB reads/s per campaign | ~99% |
| session-stats | 1,500 req/s → 6,000 queries/s | 1,500 req/s → ~16 queries/s per campaign | ~99% |

**New package (Next.js app):**

```
ioredis
```

---

## Gap 6 — k6 Load Test

### Purpose

Validate the Redis-hardened stack under realistic exam-day load before going live with RBC candidates.

### File: `load-tests/exam-session.js`

A k6 script that simulates 15k concurrent candidates across a full session lifecycle.

**Two legs per virtual user (run concurrently):**

1. **HTTP polling leg** — polls `/api/candidate/broadcast` every 20s and `/api/candidate/session-stats` every 10s with a Bearer token. Mirrors the real waiting-room and exam polling behaviour.

2. **WebSocket leg** — connects to the socket server via Socket.IO-compatible WebSocket URL, emits `candidate:join`, listens for `session:start` / `session:end` / `broadcast` events.

**Ramp profile:**

```
Stage 1 (0–5 min):   ramp 0 → 15,000 VUs    (candidates logging in)
Stage 2 (5–15 min):  hold at 15,000 VUs      (waiting room + exam)
Stage 3 (15–20 min): ramp 15,000 → 0 VUs     (completions + disconnects)
```

**Pass/fail thresholds:**

```js
thresholds: {
  http_req_duration: ["p(95)<500"],   // 95th percentile HTTP under 500ms
  ws_connecting:     ["p(95)<1000"],  // WebSocket handshake under 1s
  http_req_failed:   ["rate<0.001"],  // HTTP error rate under 0.1%
}
```

**Environment variables consumed by the script:**

```
BASE_URL   = https://your-staging-domain.com
WS_URL     = wss://your-socket-server.railway.app
AUTH_TOKEN = a valid candidate JWT for testing
```

### File: `load-tests/README.md`

Instructions: install k6, set env vars, run command, interpret results.

---

## Data Flow After Changes

```
Candidate browser
  │
  ├─ HTTP poll every 10-20s ──→ Vercel (Next.js)
  │                                  │
  │                         Redis cache hit? ──yes──→ return cached JSON
  │                                  │ no
  │                              Neon DB ──────────→ return + cache 15s
  │
  └─ WebSocket ──────────────→ Railway (socket server replica A or B)
                                       │
                              @socket.io/redis-adapter
                                       │
                                   Railway Redis
                                       │
                              (rooms + candidate state shared)
```

---

## What This Spec Does Not Cover

- SSE push replacement for polling (long-term fix for gap 5 — a separate spec)
- Multiple socket server replicas behind a load balancer (operational Railway config, not code)
- k6 GitHub Actions CI integration (out of scope for this phase)
- Redis persistence / AOF config (Railway default RDB persistence is acceptable for this use case)
