import bcrypt from "bcryptjs";

export { slugify } from "@/lib/slugify";

// Readable 8-char password — no ambiguous chars (0/O/1/I/l)
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Access ID: first 4 alpha chars of campaign name uppercased, padded to 4 with 'X', then '-', then 6-digit zero-padded seq
// Example: "Relationship Manager RBC" → "RELA-000001"
export function makeAccessId(campaignName: string, seq: number): string {
  const prefix = campaignName
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}

export function formatExamDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}
