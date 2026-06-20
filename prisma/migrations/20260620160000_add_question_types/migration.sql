-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExamQuestionType" ADD VALUE 'TRUE_FALSE';
ALTER TYPE "ExamQuestionType" ADD VALUE 'LIKERT';
ALTER TYPE "ExamQuestionType" ADD VALUE 'RANKING';
ALTER TYPE "ExamQuestionType" ADD VALUE 'POLL';
ALTER TYPE "ExamQuestionType" ADD VALUE 'WORD_CLOUD';
ALTER TYPE "ExamQuestionType" ADD VALUE 'PICTURE';

-- AlterTable
ALTER TABLE "exam_questions" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "exam_choices" ADD COLUMN     "imageUrl" TEXT;

