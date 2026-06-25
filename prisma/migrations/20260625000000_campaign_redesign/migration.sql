-- Migration: campaign_redesign
-- Campaign absorbs Session. accessId replaces rollNumber. OTP fields dropped.
-- This is a dev-only migration that truncates existing test data to allow
-- clean schema changes (no FK-linked test rows remain after truncation).

-- ============================================================
-- STEP 1: Drop all data that would violate the new constraints
-- (dev environment — test data only)
-- ============================================================

-- Drop responses first (FK depends on Candidate and Question)
DELETE FROM "Response";

-- Drop candidates (FK depends on Campaign and Session)
DELETE FROM "Candidate";

-- Drop questions (FK depends on Session)
DELETE FROM "Question";

-- Drop campaigns (FK depends on Session)
DELETE FROM "Campaign";

-- ============================================================
-- STEP 2: Drop old enum and constraints
-- ============================================================

-- Drop FK constraints on Campaign
ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_sessionId_fkey";

-- Drop FK constraints on Candidate
ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS "Candidate_sessionId_fkey";
ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS "Candidate_campaignId_fkey";

-- Drop FK constraints on Question
ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_sessionId_fkey";

-- Drop old unique indexes on Candidate
DROP INDEX IF EXISTS "Candidate_rollNumber_key";
DROP INDEX IF EXISTS "Candidate_email_key";
DROP INDEX IF EXISTS "Candidate_rollNumber_sessionId_key";
DROP INDEX IF EXISTS "Candidate_email_sessionId_key";

-- Drop old unique indexes on Campaign
DROP INDEX IF EXISTS "Campaign_slug_key";

-- ============================================================
-- STEP 3: Create new CampaignStatus enum
-- ============================================================

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'ENDED');

-- ============================================================
-- STEP 4: Rebuild Campaign table with new shape
-- ============================================================

-- Add new columns to Campaign (all nullable or with defaults first)
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "slug";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "active";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "expiresAt";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "sessionId";

-- Add status column
ALTER TABLE "Campaign" ADD COLUMN "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT';

-- Add joinToken (nullable first, then backfill, then make NOT NULL)
ALTER TABLE "Campaign" ADD COLUMN "joinToken" TEXT;
UPDATE "Campaign" SET "joinToken" = gen_random_uuid()::text WHERE "joinToken" IS NULL;
ALTER TABLE "Campaign" ALTER COLUMN "joinToken" SET NOT NULL;

-- Add scheduledAt
ALTER TABLE "Campaign" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- Add autoStart
ALTER TABLE "Campaign" ADD COLUMN "autoStart" BOOLEAN NOT NULL DEFAULT false;

-- Add startedAt
ALTER TABLE "Campaign" ADD COLUMN "startedAt" TIMESTAMP(3);

-- Add endedAt
ALTER TABLE "Campaign" ADD COLUMN "endedAt" TIMESTAMP(3);

-- Add durationSec
ALTER TABLE "Campaign" ADD COLUMN "durationSec" INTEGER NOT NULL DEFAULT 0;

-- Add logoUrl
ALTER TABLE "Campaign" ADD COLUMN "logoUrl" TEXT;

-- Add bgColor
ALTER TABLE "Campaign" ADD COLUMN "bgColor" TEXT NOT NULL DEFAULT '#F8FAFC';

-- Add negativeMarking
ALTER TABLE "Campaign" ADD COLUMN "negativeMarking" BOOLEAN NOT NULL DEFAULT false;

-- Add negativeMarkingValue
ALTER TABLE "Campaign" ADD COLUMN "negativeMarkingValue" DOUBLE PRECISION NOT NULL DEFAULT 0.25;

-- Add updatedAt (nullable first, backfill, then NOT NULL)
ALTER TABLE "Campaign" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Campaign" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
ALTER TABLE "Campaign" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Add unique index on joinToken
CREATE UNIQUE INDEX "Campaign_joinToken_key" ON "Campaign"("joinToken");

-- ============================================================
-- STEP 5: Rebuild Candidate table with new shape
-- ============================================================

-- Rename rollNumber to accessId
ALTER TABLE "Candidate" RENAME COLUMN "rollNumber" TO "accessId";

-- Drop OTP fields
ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "otpCode";
ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "otpExpiresAt";

-- Drop sessionId column
ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "sessionId";

-- Make campaignId NOT NULL (table is empty now so safe)
ALTER TABLE "Candidate" ALTER COLUMN "campaignId" SET NOT NULL;

-- Re-add FK from Candidate to Campaign
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add new unique indexes
CREATE UNIQUE INDEX "Candidate_accessId_campaignId_key" ON "Candidate"("accessId", "campaignId");
CREATE UNIQUE INDEX "Candidate_email_campaignId_key" ON "Candidate"("email", "campaignId");

-- ============================================================
-- STEP 6: Rebuild Question table with new shape
-- ============================================================

-- Drop sessionId column
ALTER TABLE "Question" DROP COLUMN IF EXISTS "sessionId";

-- Add campaignId column (NOT NULL — table is empty now so safe)
ALTER TABLE "Question" ADD COLUMN "campaignId" TEXT NOT NULL;

-- Re-add FK from Question to Campaign
ALTER TABLE "Question" ADD CONSTRAINT "Question_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- STEP 7: Drop Session table (and its enum)
-- ============================================================

DROP TABLE IF EXISTS "Session";
DROP TYPE IF EXISTS "SessionStatus";
