-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "instructionsHtml" TEXT;

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
