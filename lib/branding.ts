import { prisma } from "@/lib/prisma";

// The owner's branding row, created with schema defaults if they don't have one yet.
export async function getBrandingForOwner(ownerId: string) {
  let branding = await prisma.orgBranding.findFirst({ where: { ownerId } });
  if (!branding) {
    branding = await prisma.orgBranding.create({ data: { ownerId } });
  }
  return branding;
}
