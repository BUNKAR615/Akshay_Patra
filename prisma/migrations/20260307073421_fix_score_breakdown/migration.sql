/*
  Warnings:

  - The values [OTHER,PERFORMANCE,BEHAVIOR,RELIABILITY] on the enum `QuestionCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `bmScore` on the `branch_manager_evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `combinedScore` on the `branch_manager_evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `cmScore` on the `cluster_manager_evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `totalScore` on the `self_assessments` table. All the data in the column will be lost.
  - You are about to drop the column `combinedScore` on the `supervisor_evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `supervisorScore` on the `supervisor_evaluations` table. All the data in the column will be lost.
  - Added the required column `bmContribution` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bmNormalized` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bmRawScore` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selfContribution` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stage3CombinedScore` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorContribution` to the `branch_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bmContribution` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cmContribution` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cmNormalized` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cmRawScore` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selfContribution` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorContribution` to the `cluster_manager_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxScore` to the `self_assessments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `normalizedScore` to the `self_assessments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawScore` to the `self_assessments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selfContribution` to the `supervisor_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stage2CombinedScore` to the `supervisor_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorContribution` to the `supervisor_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorNormalized` to the `supervisor_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supervisorRawScore` to the `supervisor_evaluations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "QuestionCategory_new" AS ENUM ('ATTENDANCE', 'DISCIPLINE', 'PRODUCTIVITY', 'TEAMWORK', 'INITIATIVE', 'COMMUNICATION', 'INTEGRITY');
ALTER TABLE "questions" ALTER COLUMN "category" TYPE "QuestionCategory_new" USING ("category"::text::"QuestionCategory_new");
ALTER TYPE "QuestionCategory" RENAME TO "QuestionCategory_old";
ALTER TYPE "QuestionCategory_new" RENAME TO "QuestionCategory";
DROP TYPE "public"."QuestionCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "branch_manager_evaluations" DROP COLUMN "bmScore",
DROP COLUMN "combinedScore",
ADD COLUMN     "bmContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "bmNormalized" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "bmRawScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "selfContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "stage3CombinedScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "supervisorContribution" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "cluster_manager_evaluations" DROP COLUMN "cmScore",
ADD COLUMN     "bmContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "cmContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "cmNormalized" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "cmRawScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "selfContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "supervisorContribution" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "textHindi" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "self_assessments" DROP COLUMN "totalScore",
ADD COLUMN     "maxScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "normalizedScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "rawScore" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "supervisor_evaluations" DROP COLUMN "combinedScore",
DROP COLUMN "supervisorScore",
ADD COLUMN     "selfContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "stage2CombinedScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "supervisorContribution" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "supervisorNormalized" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "supervisorRawScore" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE INDEX "branch_manager_evaluations_employeeId_quarterId_idx" ON "branch_manager_evaluations"("employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "cluster_manager_evaluations_employeeId_quarterId_idx" ON "cluster_manager_evaluations"("employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "questions_level_isActive_idx" ON "questions"("level", "isActive");

-- CreateIndex
CREATE INDEX "self_assessments_userId_quarterId_idx" ON "self_assessments"("userId", "quarterId");

-- CreateIndex
CREATE INDEX "supervisor_evaluations_employeeId_quarterId_idx" ON "supervisor_evaluations"("employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "users_departmentId_role_idx" ON "users"("departmentId", "role");
