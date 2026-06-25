// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Upsert a single OrgBranding record (singleton pattern — update if exists).
  const branding = await prisma.orgBranding.upsert({
    where: { id: "seed-org-branding" },
    update: {},
    create: {
      id: "seed-org-branding",
      orgName: "PreCognise",
      tagline: "Candidate Assessment Platform",
      primaryColour: "#2E0BFC",
    },
  });
  console.log(`OrgBranding ready: ${branding.id}`);

  // Upsert a single AssessmentSettings record.
  const settings = await prisma.assessmentSettings.upsert({
    where: { id: "seed-assessment-settings" },
    update: {},
    create: {
      id: "seed-assessment-settings",
      antiCheatTabSwitch: true,
      antiCheatContextMenu: true,
      antiCheatCopyPaste: true,
      antiCheatScreenshot: true,
      antiCheatDevTools: true,
      speedBonusEnabled: true,
      gracePeriodSec: 0,
      geoRestriction: "",
    },
  });
  console.log(`AssessmentSettings ready: ${settings.id}`);

  console.log("Seed complete. Campaigns, questions, and candidates are created via the admin UI.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
