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
