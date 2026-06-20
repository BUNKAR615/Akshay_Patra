-- CreateEnum
CREATE TYPE "ExamApprovalMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "RegistrantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "allowReattempts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "externalApprovalMode" "ExamApprovalMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "externalEmailRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "externalEmpCodeRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "externalMobileRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "external_registrants" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "empCode" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "department" TEXT,
    "branch" TEXT,
    "designation" TEXT,
    "status" "RegistrantStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_registrants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_registrants_examId_status_idx" ON "external_registrants"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "external_registrants_examId_empCode_key" ON "external_registrants"("examId", "empCode");

-- AddForeignKey
ALTER TABLE "external_registrants" ADD CONSTRAINT "external_registrants_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

