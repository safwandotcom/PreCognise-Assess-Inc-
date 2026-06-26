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
