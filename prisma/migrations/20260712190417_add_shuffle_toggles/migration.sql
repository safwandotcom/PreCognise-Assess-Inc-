-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "antiCheatShuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "antiCheatShuffleAnswers" BOOLEAN NOT NULL DEFAULT false;
