import { slugify } from "@/lib/slugify";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Returns a join-token slug of `name`, unique across Campaign.joinToken.
// On collision, appends -2, -3, … until free. Falls back to "campaign" for empty slugs.
export async function uniqueJoinSlug(name: string, db: Db): Promise<string> {
  const base = slugify(name) || "campaign";
  let candidate = base;
  let n = 1;
  // Loop until an unused slug is found.
  while (await db.campaign.findUnique({ where: { joinToken: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
