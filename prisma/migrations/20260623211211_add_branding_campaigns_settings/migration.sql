-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "AssessmentSettings" (
    "id" TEXT NOT NULL,
    "antiCheatTabSwitch" BOOLEAN NOT NULL DEFAULT true,
    "antiCheatContextMenu" BOOLEAN NOT NULL DEFAULT true,
    "antiCheatCopyPaste" BOOLEAN NOT NULL DEFAULT true,
    "antiCheatScreenshot" BOOLEAN NOT NULL DEFAULT true,
    "antiCheatDevTools" BOOLEAN NOT NULL DEFAULT true,
    "speedBonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gracePeriodSec" INTEGER NOT NULL DEFAULT 0,
    "geoRestriction" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgBranding" (
    "id" TEXT NOT NULL,
    "orgName" TEXT NOT NULL DEFAULT 'PreCognise',
    "tagline" TEXT NOT NULL DEFAULT 'Candidate Assessment',
    "logoUrl" TEXT,
    "primaryColour" TEXT NOT NULL DEFAULT '#3730A3',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "maxCandidates" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
