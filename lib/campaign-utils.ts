import bcrypt from "bcryptjs";
import { CampaignStatus } from "@prisma/client";

export { slugify } from "@/lib/slugify";

// A live campaign must never change what candidates are being scored
// against mid-run — once a campaign has gone LIVE (including if it's since
// been PAUSED or ENDED), its questions are locked. Only DRAFT/SCHEDULED
// campaigns can still have their question set edited.
export function canEditQuestions(status: CampaignStatus): boolean {
  return status === CampaignStatus.DRAFT || status === CampaignStatus.SCHEDULED;
}

// Readable 8-char password — no ambiguous chars (0/O/1/I/l)
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Access ID: first 4 alphanumerics of campaign name uppercased, padded to 4 with 'X', then '-',
// then the sequence number padded to the width of the campaign's candidate limit (no padding when unlimited).
// Examples: limit 500 → "RELA-001"; no limit → "RELA-1".
export function makeAccessId(campaignName: string, seq: number, maxCandidates: number | null): string {
  const prefix = campaignName
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const width = maxCandidates ? String(maxCandidates).length : 0;
  return `${prefix}-${String(seq).padStart(width, '0')}`;
}

// Next sequence number for a campaign's access IDs. Derived from the highest
// existing suffix rather than the live candidate count, so a gap left by a
// deleted candidate can't cause the next generated accessId to collide with
// one still in use (accessId is unique per campaign).
export function nextAccessSeq(existing: { accessId: string }[]): number {
  let max = 0;
  for (const { accessId } of existing) {
    const match = accessId.match(/-(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

export function formatExamDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}
