# Phase 2: Scale Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Redis-backed Socket.IO state and Next.js response caching to handle 15,000 concurrent candidates, and validate the hardened stack with a k6 load test script.

**Architecture:** A single Railway Redis instance serves two purposes: as the Socket.IO pub/sub adapter (shared room and state storage across replicas) and as a 15-second TTL cache for two high-frequency Next.js polling endpoints. The socket server's synchronous in-memory `Map`/`Set` in `state.ts` is replaced with async Redis hash/set operations. The Next.js app gets a global `ioredis` singleton (same `global.*` pattern as `lib/prisma.ts`) used by the two polling routes.

**Tech Stack:** ioredis 5.x, @socket.io/redis-adapter 8.x, socket.io 4.8.x (existing), Next.js 16 (existing), Jest + ts-jest + ioredis-mock (socket-server unit tests), k6 (separate install, not a project dependency)

## Global Constraints

- `REDIS_URL` env var required in both Railway (socket-server) and Vercel (Next.js): `redis://default:<password>@<host>:<port>`
- ioredis version: `^5.3.2`
- @socket.io/redis-adapter version: `^8.3.0`
- Cache TTL: exactly `15` seconds (both polling endpoints, no exceptions)
- Cache key for broadcast: `broadcast:{campaignId}` (exact string, curly braces are literal)
- Cache key for session-stats: `session-stats:{campaignId}` (exact string)
- Redis candidate hash key: `candidate:{candidateId}` (exact string)
- Redis admin set key: `admin:sockets` (exact string)
- All exported functions in `state.ts` keep their existing names; return types change from sync to async (Promise-wrapped)
- Candidate emit in `anticheat.ts`: `io.to(candidateId)` — NOT `io.to(candidate.socketId)`
- k6 thresholds (exact): `http_req_duration["p(95)<500"]`, `ws_connecting["p(95)<1000"]`, `http_req_failed["rate<0.001"]`
- k6 load shape: ramp 0→15000 over 5min, hold 10min, ramp 15000→0 over 5min
- One Railway Redis instance only — no Upstash or second provider
- Do NOT modify `socket-server/tsconfig.json` — configure ts-jest with inline tsconfig override in jest.config.js

---

## File Map

**socket-server/ (new/modified)**
- `socket-server/src/redis-client.ts` — NEW: ioredis singleton used by state.ts and index.ts
- `socket-server/src/state.ts` — REWRITE: sync Map/Set → async Redis hash/set operations
- `socket-server/src/index.ts` — MODIFY: attach `@socket.io/redis-adapter` after creating Server
- `socket-server/src/handlers.ts` — MODIFY: await all state function calls, add error handling
- `socket-server/src/anticheat.ts` — MODIFY: await state calls + switch to room-based emit
- `socket-server/src/__tests__/state.test.ts` — NEW: Jest unit tests for state.ts
- `socket-server/jest.config.js` — NEW: Jest config with ts-jest commonjs override

**Next.js app (new/modified)**
- `lib/redis.ts` — NEW: global ioredis singleton
- `app/api/candidate/broadcast/route.ts` — MODIFY: add Redis cache layer
- `app/api/candidate/session-stats/route.ts` — MODIFY: add Redis cache layer

**Load tests (new)**
- `load-tests/exam-session.js` — NEW: k6 script simulating 15k candidates
- `load-tests/README.md` — NEW: setup and run instructions

---

### Task 1: Socket-server — install deps + Redis client + Jest

**Files:**
- Modify: `socket-server/package.json`
- Create: `socket-server/jest.config.js`
- Create: `socket-server/src/redis-client.ts`

**Interfaces:**
- Consumes: `REDIS_URL` env var
- Produces: `import { redis } from "./redis-client"` — an `IORedis` instance consumed by Tasks 2 and 3

- [ ] **Step 1: Install production dependencies**

```bash
cd socket-server && npm install ioredis @socket.io/redis-adapter
```

Expected: `package.json` `dependencies` now includes `"ioredis"` and `"@socket.io/redis-adapter"`.

- [ ] **Step 2: Install test dependencies**

```bash
npm install --save-dev jest ts-jest @types/jest ioredis-mock
```

Expected: `devDependencies` now includes `jest`, `ts-jest`, `@types/jest`, `ioredis-mock`.

- [ ] **Step 3: Add test script to package.json**

In `socket-server/package.json`, add `"test": "jest"` to `scripts`:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "start": "node node_modules/tsx/dist/cli.mjs src/index.ts",
  "test": "jest"
}
```

- [ ] **Step 4: Create jest.config.js**

Create `socket-server/jest.config.js`:

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
```

The inline `tsconfig` override tells ts-jest to use `commonjs` modules without touching the existing `tsconfig.json`.

- [ ] **Step 5: Create src/redis-client.ts**

Create `socket-server/src/redis-client.ts`:

```typescript
import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
```

- [ ] **Step 6: Verify Jest initialises (no tests yet)**

```bash
npm test
```

Expected: Jest runs and prints `No test suites were run` (or a warning about no test files). Exit code 0 or Jest's standard "no tests found" message. No compile errors.

- [ ] **Step 7: Commit**

```bash
cd socket-server && git add package.json jest.config.js src/redis-client.ts
cd .. && git commit -m "feat: add ioredis + redis-adapter deps and jest to socket-server"
```

---

### Task 2: Rewrite state.ts with Redis + unit tests

**Files:**
- Rewrite: `socket-server/src/state.ts`
- Create: `socket-server/src/__tests__/state.test.ts`

**Interfaces:**
- Consumes: `redis` from `./redis-client` (Task 1)
- Produces (all functions async from here on — every later task uses these signatures):
  ```typescript
  interface CandidateState {
    socketId: string;
    accessId: string;
    tabSwitchCount: number;
    status: "ACTIVE" | "DISQUALIFIED" | "COMPLETED";
  }
  addCandidate(candidateId: string, socketId: string, accessId: string): Promise<void>
  removeCandidate(candidateId: string): Promise<void>
  getCandidate(candidateId: string): Promise<CandidateState | undefined>
  updateStatus(candidateId: string, status: CandidateState["status"]): Promise<void>
  incrementTabSwitch(candidateId: string): Promise<number>
  addAdminSocket(socketId: string): Promise<void>
  removeAdminSocket(socketId: string): Promise<void>
  getAdminSockets(): Promise<string[]>
  ```

- [ ] **Step 1: Write the failing test file**

Create `socket-server/src/__tests__/state.test.ts`:

```typescript
// jest.mock is hoisted above imports, so the mock replaces ./redis-client
// before state.ts loads it — the mock Redis is what state.ts operates on.
jest.mock("../redis-client", () => ({
  redis: new (require("ioredis-mock"))(),
}));

import { redis } from "../redis-client";
import {
  addCandidate,
  removeCandidate,
  getCandidate,
  updateStatus,
  incrementTabSwitch,
  addAdminSocket,
  removeAdminSocket,
  getAdminSockets,
} from "../state";

beforeEach(async () => {
  // Clear all Redis keys between tests so each test starts from a clean slate.
  await (redis as any).flushall();
});

test("addCandidate stores candidate; getCandidate retrieves it", async () => {
  await addCandidate("c1", "s1", "A001");
  const candidate = await getCandidate("c1");
  expect(candidate).toEqual({
    socketId: "s1",
    accessId: "A001",
    tabSwitchCount: 0,
    status: "ACTIVE",
  });
});

test("getCandidate returns undefined for unknown id", async () => {
  expect(await getCandidate("nobody")).toBeUndefined();
});

test("removeCandidate deletes the candidate", async () => {
  await addCandidate("c1", "s1", "A001");
  await removeCandidate("c1");
  expect(await getCandidate("c1")).toBeUndefined();
});

test("updateStatus changes status, leaves other fields intact", async () => {
  await addCandidate("c1", "s1", "A001");
  await updateStatus("c1", "DISQUALIFIED");
  const candidate = await getCandidate("c1");
  expect(candidate?.status).toBe("DISQUALIFIED");
  expect(candidate?.accessId).toBe("A001");
  expect(candidate?.tabSwitchCount).toBe(0);
});

test("incrementTabSwitch returns incrementing counts", async () => {
  await addCandidate("c1", "s1", "A001");
  expect(await incrementTabSwitch("c1")).toBe(1);
  expect(await incrementTabSwitch("c1")).toBe(2);
  expect((await getCandidate("c1"))?.tabSwitchCount).toBe(2);
});

test("addAdminSocket / getAdminSockets / removeAdminSocket", async () => {
  await addAdminSocket("sock-a");
  await addAdminSocket("sock-b");
  const before = await getAdminSockets();
  expect(before).toContain("sock-a");
  expect(before).toContain("sock-b");

  await removeAdminSocket("sock-a");
  const after = await getAdminSockets();
  expect(after).not.toContain("sock-a");
  expect(after).toContain("sock-b");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd socket-server && npm test
```

Expected: FAIL — errors about missing exports or type mismatch (old state.ts still has sync functions).

- [ ] **Step 3: Rewrite state.ts**

Replace the entire content of `socket-server/src/state.ts`:

```typescript
import { redis } from "./redis-client";

export interface CandidateState {
  socketId: string;
  accessId: string;
  tabSwitchCount: number;
  status: "ACTIVE" | "DISQUALIFIED" | "COMPLETED";
}

export async function addCandidate(
  candidateId: string,
  socketId: string,
  accessId: string
): Promise<void> {
  await redis.hset(`candidate:${candidateId}`, {
    socketId,
    accessId,
    tabSwitchCount: 0,
    status: "ACTIVE",
  });
}

export async function removeCandidate(candidateId: string): Promise<void> {
  await redis.del(`candidate:${candidateId}`);
}

export async function getCandidate(
  candidateId: string
): Promise<CandidateState | undefined> {
  const data = await redis.hgetall(`candidate:${candidateId}`);
  if (!data || Object.keys(data).length === 0) return undefined;
  return {
    socketId: data["socketId"]!,
    accessId: data["accessId"]!,
    tabSwitchCount: parseInt(data["tabSwitchCount"]!, 10),
    status: data["status"]! as CandidateState["status"],
  };
}

export async function updateStatus(
  candidateId: string,
  status: CandidateState["status"]
): Promise<void> {
  await redis.hset(`candidate:${candidateId}`, "status", status);
}

export async function incrementTabSwitch(candidateId: string): Promise<number> {
  return redis.hincrby(`candidate:${candidateId}`, "tabSwitchCount", 1);
}

export async function addAdminSocket(socketId: string): Promise<void> {
  await redis.sadd("admin:sockets", socketId);
}

export async function removeAdminSocket(socketId: string): Promise<void> {
  await redis.srem("admin:sockets", socketId);
}

export async function getAdminSockets(): Promise<string[]> {
  return redis.smembers("admin:sockets");
}
```

Note on `data["socketId"]!`: the existing tsconfig has `"noUncheckedIndexedAccess": true`, which makes hash lookups return `string | undefined`. The `!` assertion is safe here because we've already confirmed the hash is non-empty (via the `Object.keys` check above).

- [ ] **Step 4: Run tests — all 6 must pass**

```bash
npm test
```

Expected:
```
PASS src/__tests__/state.test.ts
  ✓ addCandidate stores candidate; getCandidate retrieves it
  ✓ getCandidate returns undefined for unknown id
  ✓ removeCandidate deletes the candidate
  ✓ updateStatus changes status, leaves other fields intact
  ✓ incrementTabSwitch returns incrementing counts
  ✓ addAdminSocket / getAdminSockets / removeAdminSocket

Tests: 6 passed, 6 total
```

- [ ] **Step 5: Commit**

```bash
cd socket-server && git add src/state.ts src/__tests__/state.test.ts
cd .. && git commit -m "feat: rewrite state.ts with Redis hash/set operations + tests"
```

---

### Task 3: Attach Redis adapter + update index, handlers, anticheat

**Files:**
- Modify: `socket-server/src/index.ts`
- Modify: `socket-server/src/handlers.ts`
- Modify: `socket-server/src/anticheat.ts`

**Interfaces:**
- Consumes: `redis` from `./redis-client` (Task 1); async state functions from `./state` (Task 2)
- Produces: running socket server with Redis adapter; all state calls awaited; candidate disqualification emits via room (not socketId)

- [ ] **Step 1: Replace index.ts — attach Redis adapter**

Replace the full content of `socket-server/src/index.ts`:

```typescript
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import cors from "cors";
import jwt from "jsonwebtoken";
import { redis } from "./redis-client";
import { registerCandidateHandlers, registerAdminHandlers } from "./handlers";

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from socket-server's environment");
}

const app = express();
app.use(cors({ origin: FRONTEND_URL }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL },
});

// Attach Redis adapter. pub client = existing connection; sub = dedicated duplicate.
const subClient = redis.duplicate();
io.adapter(createAdapter(redis, subClient));

io.on("connection", (socket) => {
  const { token, isAdmin } = socket.handshake.auth as {
    token?: string;
    isAdmin?: boolean;
  };

  if (isAdmin) {
    registerAdminHandlers(io, socket);
    return;
  }

  if (!token) {
    console.log(`Rejected socket ${socket.id}: no token and not flagged admin`);
    socket.disconnect();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      candidateId: string;
      accessId: string;
      campaignId: string;
    };

    socket.join(payload.candidateId); // private room — used by adapter for cross-replica emit
    registerCandidateHandlers(io, socket, payload);
  } catch {
    console.log(`Rejected socket ${socket.id}: invalid or expired token`);
    socket.disconnect();
  }
});

httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
```

- [ ] **Step 2: Replace handlers.ts — await all state calls**

Replace the full content of `socket-server/src/handlers.ts`:

```typescript
import { Server, Socket } from "socket.io";
import { addCandidate, removeCandidate, addAdminSocket, removeAdminSocket } from "./state";
import { handleTabSwitch, handlePageRefresh, disqualifyCandidate } from "./anticheat";

interface CandidateAuth {
  candidateId: string;
  accessId: string;
  campaignId: string;
}

export function registerCandidateHandlers(
  io: Server,
  socket: Socket,
  auth: CandidateAuth
) {
  const { candidateId, accessId } = auth;

  socket.on("candidate:join", async () => {
    try {
      await addCandidate(candidateId, socket.id, accessId);
      socket.join("candidates");
      io.to("admins").emit("stats:update");
    } catch (err) {
      console.error("candidate:join error:", err);
      socket.disconnect();
    }
  });

  socket.on("tab:switch", async () => {
    try {
      await handleTabSwitch(io, socket, candidateId);
    } catch (err) {
      console.error("tab:switch error:", err);
    }
  });

  socket.on("page:refresh", async () => {
    try {
      await handlePageRefresh(io, socket, candidateId);
    } catch (err) {
      console.error("page:refresh error:", err);
    }
  });

  socket.on("disconnect", async () => {
    try {
      await removeCandidate(candidateId);
    } catch (err) {
      console.error("disconnect cleanup error:", err);
    }
  });
}

export function registerAdminHandlers(io: Server, socket: Socket) {
  socket.on("admin:join", async () => {
    try {
      socket.join("admins");
      await addAdminSocket(socket.id);
    } catch (err) {
      console.error("admin:join error:", err);
    }
  });

  socket.on("session:start", () => {
    io.to("candidates").emit("session:start");
  });

  socket.on("session:end", () => {
    io.to("candidates").emit("session:end");
  });

  socket.on("admin:disqualify", ({ candidateId, reason }: { candidateId: string; reason: string }) => {
    disqualifyCandidate(io, candidateId, reason);
  });

  socket.on("admin:broadcast", ({ message }: { message: string }) => {
    if (typeof message === "string" && message.trim().length > 0) {
      io.to("candidates").emit("broadcast", { message: message.trim() });
    }
  });

  socket.on("disconnect", async () => {
    try {
      await removeAdminSocket(socket.id);
    } catch (err) {
      console.error("admin disconnect cleanup error:", err);
    }
  });
}
```

- [ ] **Step 3: Replace anticheat.ts — await state calls + room-based emit**

Replace the full content of `socket-server/src/anticheat.ts`:

```typescript
import { Server, Socket } from "socket.io";
import { getCandidate, updateStatus, incrementTabSwitch } from "./state";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export type DisqualifyReason = "TAB_SWITCH_2" | "PAGE_REFRESH" | string;

export async function disqualifyCandidate(
  io: Server,
  candidateId: string,
  reason: DisqualifyReason
) {
  const candidate = await getCandidate(candidateId);

  await updateStatus(candidateId, "DISQUALIFIED");

  // Emit to the candidate's private room (named after candidateId in index.ts).
  // With Redis adapter, this reaches the socket regardless of which replica it is on.
  io.to(candidateId).emit("disqualified", { reason });

  io.to("admins").emit("candidate:event", {
    id: candidateId,
    status: "DISQUALIFIED",
    disqualifyReason: reason,
    tabSwitchCount: candidate?.tabSwitchCount,
  });

  try {
    const res = await fetch(`${FRONTEND_URL}/api/admin/disqualify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ candidateId, reason }),
    });
    console.log("Disqualify DB response:", res.status);
  } catch (err) {
    console.error("Failed to persist disqualification:", err);
  }
}

export async function handleTabSwitch(io: Server, socket: Socket, candidateId: string) {
  const count = await incrementTabSwitch(candidateId);

  if (count === 1) {
    socket.emit("warning", {
      message: "Tab switch detected. Next switch will disqualify you.",
    });
  } else if (count >= 2) {
    await disqualifyCandidate(io, candidateId, "TAB_SWITCH_2");
  }
}

export async function handlePageRefresh(io: Server, socket: Socket, candidateId: string) {
  await disqualifyCandidate(io, candidateId, "PAGE_REFRESH");
}
```

- [ ] **Step 4: Confirm tests still pass**

```bash
cd socket-server && npm test
```

Expected: all 6 tests still pass (state.ts tests don't depend on index/handlers/anticheat).

- [ ] **Step 5: Smoke test — socket server starts with Redis**

With a local Redis running or Railway Redis available:

```bash
REDIS_URL=redis://localhost:6379 JWT_SECRET=test-secret npm run dev
```

Expected output:
```
Socket server running on port 4000
```

No connection errors, no TypeScript compile errors from tsx. Ctrl+C to stop.

- [ ] **Step 6: Commit**

```bash
cd socket-server && git add src/index.ts src/handlers.ts src/anticheat.ts
cd .. && git commit -m "feat: attach Redis adapter; await state calls in handlers and anticheat"
```

---

### Task 4: Next.js Redis cache for polling endpoints

**Files:**
- Modify: `package.json` (root)
- Create: `lib/redis.ts`
- Modify: `app/api/candidate/broadcast/route.ts`
- Modify: `app/api/candidate/session-stats/route.ts`

**Interfaces:**
- Consumes: `REDIS_URL` env var; existing `verifyToken` and `prisma` from their existing lib modules
- Produces: `redis` singleton from `lib/redis.ts`; both polling routes now return cached responses on repeat calls within 15s

- [ ] **Step 1: Install ioredis in the Next.js app**

Run this from the project root (not inside socket-server):

```bash
npm install ioredis
```

Expected: `"ioredis"` appears in root `package.json` `dependencies`.

- [ ] **Step 2: Create lib/redis.ts**

Create `lib/redis.ts`:

```typescript
import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var redis: IORedis | undefined;
}

export const redis =
  global.redis ?? new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

if (process.env.NODE_ENV !== "production") global.redis = redis;
```

The `global.redis` pattern prevents creating a new Redis connection on every hot-reload in development, matching the `global.prisma` pattern already in `lib/prisma.ts`.

- [ ] **Step 3: Update broadcast route with 15s cache**

Replace the full content of `app/api/candidate/broadcast/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.slice(7);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { campaignId } = verifyToken(token);

    const cacheKey = `broadcast:${campaignId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json(JSON.parse(cached));

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { lastBroadcast: true, lastBroadcastAt: true },
    });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payload = {
      message: campaign.lastBroadcast,
      sentAt: campaign.lastBroadcastAt?.toISOString() ?? null,
    };
    await redis.set(cacheKey, JSON.stringify(payload), "EX", 15);

    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/candidate/broadcast error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Update session-stats route with 15s cache**

Replace the full content of `app/api/candidate/session-stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";
import { CandidateStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = verifyToken(token);
    const candidate = await prisma.candidate.findUnique({
      where: { id: payload.candidateId },
      select: { campaignId: true },
    });
    if (!candidate?.campaignId) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { campaignId } = candidate;
    const cacheKey = `session-stats:${campaignId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json(JSON.parse(cached));

    const [campaign, total, inWaitingRoom, joined] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } }),
      prisma.candidate.count({ where: { campaignId } }),
      prisma.candidate.count({ where: { campaignId, status: CandidateStatus.JOINED } }),
      prisma.candidate.count({
        where: {
          campaignId,
          status: { in: [CandidateStatus.JOINED, CandidateStatus.ACTIVE, CandidateStatus.COMPLETED] },
        },
      }),
    ]);

    const result = { total, inWaitingRoom, joined, sessionTitle: campaign?.name ?? null };
    await redis.set(cacheKey, JSON.stringify(result), "EX", 15);

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/candidate/session-stats error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add REDIS_URL to .env.local**

Add to `.env.local` (the file that already holds DATABASE_URL, JWT_SECRET, etc.):

```
REDIS_URL=redis://localhost:6379
```

For production: set `REDIS_URL` in the Vercel project dashboard → Settings → Environment Variables.

- [ ] **Step 6: Verify build succeeds**

```bash
npm run build
```

Expected: build completes with no TypeScript errors. If ioredis types cause issues, the existing `tsconfig.json` already has `"skipLibCheck": true` which will suppress them.

- [ ] **Step 7: Smoke test the cache**

With `npm run dev` running and a valid candidate JWT at hand:

```bash
# Replace <jwt> with a real candidate token copied from browser localStorage
# First call — cache miss, hits DB
curl -s -w "\nHTTP %{http_code} in %{time_total}s\n" \
  -H "Authorization: Bearer <jwt>" \
  http://localhost:3000/api/candidate/broadcast

# Second call immediately after — cache hit, skips DB
curl -s -w "\nHTTP %{http_code} in %{time_total}s\n" \
  -H "Authorization: Bearer <jwt>" \
  http://localhost:3000/api/candidate/broadcast
```

Expected: both return HTTP 200 with identical JSON. Second call is measurably faster (typically 10× or more on localhost).

- [ ] **Step 8: Commit**

```bash
git add lib/redis.ts app/api/candidate/broadcast/route.ts app/api/candidate/session-stats/route.ts package.json package-lock.json
git commit -m "feat: Redis cache (15s TTL) for broadcast and session-stats polling routes"
```

---

### Task 5: k6 load test script

**Files:**
- Create: `load-tests/exam-session.js`
- Create: `load-tests/README.md`

**Interfaces:**
- Consumes: `BASE_URL`, `WS_URL`, `AUTH_TOKEN` env vars at run time (not build time)
- Produces: executable k6 script with embedded thresholds; README with setup + run instructions

- [ ] **Step 1: Create load-tests/exam-session.js**

Create `load-tests/exam-session.js`:

```javascript
import http from "k6/http";
import ws from "k6/ws";
import { sleep, check, group } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const WS_URL   = __ENV.WS_URL   || "ws://localhost:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

export const options = {
  stages: [
    { duration: "5m",  target: 15000 }, // ramp up — candidates logging in
    { duration: "10m", target: 15000 }, // hold — waiting room + exam in progress
    { duration: "5m",  target: 0 },     // ramp down — completions
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],  // 95th pct HTTP response under 500ms
    ws_connecting:     ["p(95)<1000"], // WebSocket handshake under 1s
    http_req_failed:   ["rate<0.001"], // HTTP error rate under 0.1%
  },
};

const headers = { Authorization: `Bearer ${AUTH_TOKEN}` };

export default function () {
  // ── HTTP polling leg ────────────────────────────────────────────────────────
  // Mirrors what a real candidate browser does: poll broadcast every 20s,
  // poll session-stats every 10s.
  group("http-polling", () => {
    const broadcastRes = http.get(`${BASE_URL}/api/candidate/broadcast`, { headers });
    check(broadcastRes, { "broadcast 200": (r) => r.status === 200 });

    sleep(10);

    const statsRes = http.get(`${BASE_URL}/api/candidate/session-stats`, { headers });
    check(statsRes, { "session-stats 200": (r) => r.status === 200 });

    sleep(10);
  });

  // ── WebSocket leg ───────────────────────────────────────────────────────────
  // Connects using Socket.IO's WebSocket transport wire protocol.
  // Sends: Engine.IO open → Socket.IO CONNECT with auth → candidate:join event.
  group("websocket", () => {
    const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
    const res = ws.connect(wsUrl, { headers: { Origin: BASE_URL } }, (socket) => {
      socket.on("message", (msg) => {
        if (msg.startsWith("0")) {
          // Engine.IO OPEN — send Socket.IO CONNECT packet with auth token
          socket.send(`40{"token":"${AUTH_TOKEN}"}`);
        }
        if (msg.startsWith("40")) {
          // Socket.IO CONNECT ack — emit candidate:join
          socket.send('42["candidate:join"]');
        }
      });

      // Hold the connection for 20s (simulates sitting in waiting room / exam)
      socket.setTimeout(() => socket.close(), 20000);
    });

    check(res, { "websocket upgraded": (r) => r !== null && r.status === 101 });
  });
}
```

- [ ] **Step 2: Create load-tests/README.md**

Create `load-tests/README.md`:

```markdown
# Load Tests

k6 scripts for validating the platform under 15k concurrent candidate load.

## Prerequisites

Install k6 (not a Node.js package — separate binary):

- **macOS:** `brew install k6`
- **Windows:** `winget install k6 --source winget`
- **Linux / Docker:** https://k6.io/docs/getting-started/installation/

## Environment variables

| Variable     | Description                              | Example                              |
|--------------|------------------------------------------|--------------------------------------|
| `BASE_URL`   | Next.js app URL (http or https)          | `https://staging.yourdomain.com`     |
| `WS_URL`     | Socket server URL (ws or wss)            | `wss://socket.railway.app`           |
| `AUTH_TOKEN` | Valid candidate JWT for a test campaign  | (see below)                          |

### Generating a test JWT

1. Register a test candidate on a test campaign via `/apply/[slug]`
2. Log in as that candidate at `/candidate/login`
3. Open browser DevTools → Application → Local Storage
4. Copy the value of `candidateToken`

## Smoke test (verify the script runs — use before the full load test)

```bash
BASE_URL=http://localhost:3000 \
WS_URL=ws://localhost:4000 \
AUTH_TOKEN=<your-jwt> \
k6 run --vus 50 --duration 30s load-tests/exam-session.js
```

## Full load test (15k candidates — run against staging only)

```bash
BASE_URL=https://staging.yourdomain.com \
WS_URL=wss://your-socket-server.railway.app \
AUTH_TOKEN=<your-jwt> \
k6 run load-tests/exam-session.js
```

## Pass criteria

All three thresholds must show `✓` at the end of the run:

| Threshold                         | Pass condition       |
|-----------------------------------|----------------------|
| `http_req_duration p(95)`         | < 500ms              |
| `ws_connecting p(95)`             | < 1000ms             |
| `http_req_failed rate`            | < 0.1%               |

k6 exits with code 99 if any threshold fails (useful for CI gating).
```

- [ ] **Step 3: Syntax-check the script with a short smoke run**

With dev server and socket server running locally and a valid JWT:

```bash
AUTH_TOKEN=<your-jwt> k6 run --vus 10 --duration 15s load-tests/exam-session.js
```

Expected: k6 starts, runs 10 VUs for 15 seconds, prints a results summary, exits. No `SyntaxError` or `ReferenceError`. Threshold results may show `✗` against localhost — that's fine; we're only verifying the script is syntactically valid and runs.

- [ ] **Step 4: Commit**

```bash
git add load-tests/exam-session.js load-tests/README.md
git commit -m "feat: k6 load test script for 15k candidate exam session"
```

---

## New env vars required

Set these before deploying:

| Var | Where |
|-----|-------|
| `REDIS_URL` | Railway socket-server service + Vercel project settings |

The `REDIS_URL` value is the Railway Redis internal URL (available from the Railway Redis service dashboard under "Connect").
