// socket-server/src/state.ts

// What we track for each candidate while they're connected.
export interface CandidateState {
  socketId: string;
  rollNumber: string;
  tabSwitchCount: number;
  status: "ACTIVE" | "DISQUALIFIED" | "COMPLETED";
}

// candidateId -> their live state. Lives only in RAM.
const connectedCandidates = new Map<string, CandidateState>();

// Every admin's socket id, so we can broadcast to all open dashboards at once.
const adminSockets = new Set<string>();

export function addCandidate(candidateId: string, socketId: string, rollNumber: string) {
  connectedCandidates.set(candidateId, {
    socketId,
    rollNumber,
    tabSwitchCount: 0,
    status: "ACTIVE",
  });
}

export function removeCandidate(candidateId: string) {
  connectedCandidates.delete(candidateId);
}

export function getCandidate(candidateId: string): CandidateState | undefined {
  return connectedCandidates.get(candidateId);
}

export function updateStatus(candidateId: string, status: CandidateState["status"]) {
  const candidate = connectedCandidates.get(candidateId);
  if (candidate) candidate.status = status;
}

// Bumps the count and hands back the new value, so anticheat.ts can decide
// "warn" vs "disqualify" in one call without a separate lookup.
export function incrementTabSwitch(candidateId: string): number {
  const candidate = connectedCandidates.get(candidateId);
  if (!candidate) return 0;
  candidate.tabSwitchCount += 1;
  return candidate.tabSwitchCount;
}

export function addAdminSocket(socketId: string) {
  adminSockets.add(socketId);
}

export function removeAdminSocket(socketId: string) {
  adminSockets.delete(socketId);
}

export function getAdminSockets(): string[] {
  return Array.from(adminSockets);
}