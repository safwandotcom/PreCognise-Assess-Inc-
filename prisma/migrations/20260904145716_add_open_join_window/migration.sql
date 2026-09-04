-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "scheduledEnd" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "openJoinEnabled" BOOLEAN NOT NULL DEFAULT false;
