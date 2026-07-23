import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// The current admin's Clerk user id (the tenant owner), or null if unauthenticated.
export async function getOwnerId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

// Returns the campaign only if it belongs to `ownerId`; otherwise null.
// Both fetches and verifies ownership in one query — use this in every
// admin /[id] route instead of a bare findUnique({ where: { id } }).
export async function ownedCampaign(id: string, ownerId: string) {
  return prisma.campaign.findFirst({ where: { id, ownerId } });
}
