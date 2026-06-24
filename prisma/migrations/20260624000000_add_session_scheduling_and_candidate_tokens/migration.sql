-- Add SCHEDULED to SessionStatus enum
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

-- AlterTable Session: add new columns
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Untitled Session';
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "autoStart" BOOLEAN NOT NULL DEFAULT false;

-- Add joinToken as nullable first so existing rows are not blocked
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "joinToken" TEXT;

-- Backfill joinToken for existing rows with a generated uuid
UPDATE "Session" SET "joinToken" = gen_random_uuid()::text WHERE "joinToken" IS NULL;

-- Now make joinToken NOT NULL
ALTER TABLE "Session" ALTER COLUMN "joinToken" SET NOT NULL;

-- CreateIndex for joinToken uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "Session_joinToken_key" ON "Session"("joinToken");

-- AlterTable Candidate: add new optional columns
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "generatedPassword" TEXT;
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "activeToken" TEXT;

-- CreateIndex for activeToken uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "Candidate_activeToken_key" ON "Candidate"("activeToken");
