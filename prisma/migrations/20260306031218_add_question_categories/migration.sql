-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionCategory" ADD VALUE 'COMMUNICATION';
ALTER TYPE "QuestionCategory" ADD VALUE 'INTEGRITY';
ALTER TYPE "QuestionCategory" ADD VALUE 'PERFORMANCE';
ALTER TYPE "QuestionCategory" ADD VALUE 'BEHAVIOR';
ALTER TYPE "QuestionCategory" ADD VALUE 'RELIABILITY';
