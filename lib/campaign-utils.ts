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

// Roll number: SLUG-0001, SLUG-0002 ...
// slug is the campaign slug, seq is 1-based candidate count for this campaign
export function makeRollNumber(slug: string, seq: number): string {
  const prefix = slug.toUpperCase().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
