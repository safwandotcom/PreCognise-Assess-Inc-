// jest.mock is hoisted above imports, so the mock replaces ./redis-client
// before state.ts loads it — the mock Redis is what state.ts operates on.
// mockIoRedis's "mock" prefix satisfies jest's out-of-scope-variable check for hoisted factories.
import mockIoRedis from "ioredis-mock";
jest.mock("../redis-client", () => ({
  redis: new mockIoRedis(),
}));

import type { Server } from "socket.io";
import { redis } from "../redis-client";
import { addCandidate, getCandidate, removeCandidate } from "../state";
import { reportTabSwitch } from "../anticheat";

beforeEach(async () => {
  await redis.flushall();
});

function fakeIo() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload?: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  } as unknown as Server;
  return { io, emitted };
}

test("reportTabSwitch: disqualified report marks candidate DISQUALIFIED and notifies both rooms", async () => {
  await addCandidate("c1", "s1", "A001");
  const { io, emitted } = fakeIo();

  await reportTabSwitch(io, "c1", { count: 4, limit: 3, disqualified: true });

  expect((await getCandidate("c1"))?.status).toBe("DISQUALIFIED");
  expect(emitted).toContainEqual({
    room: "c1",
    event: "disqualified",
    payload: { reason: "TAB_SWITCH_LIMIT_EXCEEDED" },
  });
  expect(emitted).toContainEqual({
    room: "admins",
    event: "candidate:event",
    payload: { id: "c1", status: "DISQUALIFIED", tabSwitchCount: 4, tabSwitchLimit: 3 },
  });
});

test("reportTabSwitch: non-disqualifying report only updates the admin live view", async () => {
  await addCandidate("c1", "s1", "A001");
  const { io, emitted } = fakeIo();

  await reportTabSwitch(io, "c1", { count: 1, limit: 3, disqualified: false });

  expect((await getCandidate("c1"))?.status).toBe("ACTIVE");
  expect(emitted).toEqual([
    {
      room: "admins",
      event: "candidate:event",
      payload: { id: "c1", status: "ACTIVE", tabSwitchCount: 1, tabSwitchLimit: 3 },
    },
  ]);
});

// Regression test for #23: a candidate's socket state can be wiped by a
// disconnect (e.g. a backgrounded tab dropping its WebSocket — exactly what
// happens when a candidate switches to an already-open tab) between two real
// tab-switches. Disqualification now comes from the REST-authoritative
// report instead of a Redis counter that resets to zero on reconnect, so the
// candidate is still disqualified correctly even though their socket state
// was wiped in between.
test("reportTabSwitch: still disqualifies after the candidate's socket state was wiped by a disconnect", async () => {
  await addCandidate("c1", "s1", "A001");
  await removeCandidate("c1"); // simulates handlers.ts's disconnect handler
  const { io, emitted } = fakeIo();

  await reportTabSwitch(io, "c1", { count: 4, limit: 3, disqualified: true });

  expect((await getCandidate("c1"))?.status).toBe("DISQUALIFIED");
  expect(emitted.some((e) => e.event === "disqualified")).toBe(true);
});
