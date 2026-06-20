-- CreateEnum
CREATE TYPE "ExamParticipationMode" AS ENUM ('INTERNAL', 'INTERNAL_EXTERNAL', 'OPEN', 'CUSTOM');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "participationMode" "ExamParticipationMode" NOT NULL DEFAULT 'CUSTOM';

-- CreateTable
CREATE TABLE "audience_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "mode" "ExamParticipationMode" NOT NULL DEFAULT 'CUSTOM',
    "filters" JSONB,
    "employeeIds" TEXT[],
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audience_templates_createdById_idx" ON "audience_templates"("createdById");

