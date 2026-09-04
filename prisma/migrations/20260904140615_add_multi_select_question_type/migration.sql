-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'multi_select';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "correctOptions" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
