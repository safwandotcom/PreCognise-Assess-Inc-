import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAllowedAdminEmail } from "@/lib/admin-allowlist";

// The current admin's Clerk user id (the tenant owner), or null if
// unauthenticated OR not on the admin allowlist (#49) — every admin route
// already treats a null return as "unauthorized", so this is the one place
// that check needs to live for it to apply everywhere.
export async function getOwnerId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!isAllowedAdminEmail(email)) return null;

  return userId;
}

// Returns the campaign only if it belongs to `ownerId`; otherwise null.
// Both fetches and verifies ownership in one query — use this in every
// admin /[id] route instead of a bare findUnique({ where: { id } }).
export async function ownedCampaign(id: string, ownerId: string) {
  return prisma.campaign.findFirst({ where: { id, ownerId } });
}
