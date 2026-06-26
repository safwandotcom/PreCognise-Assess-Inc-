-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "otpHash" TEXT,
ADD COLUMN "otpExpiresAt" TIMESTAMP(3);
