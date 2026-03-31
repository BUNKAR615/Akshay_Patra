/*
  Warnings:

  - You are about to drop the `department_roles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "department_roles" DROP CONSTRAINT "department_roles_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "department_roles" DROP CONSTRAINT "department_roles_userId_fkey";

-- AlterTable
ALTER TABLE "self_assessments" ADD COLUMN     "completionTimeSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mobile" TEXT;

-- DropTable
DROP TABLE "department_roles";

-- CreateTable
CREATE TABLE "department_role_mappings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_quarter_questions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_quarter_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_role_mappings_departmentId_idx" ON "department_role_mappings"("departmentId");

-- CreateIndex
CREATE INDEX "department_role_mappings_userId_idx" ON "department_role_mappings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "department_role_mappings_userId_departmentId_role_key" ON "department_role_mappings"("userId", "departmentId", "role");

-- CreateIndex
CREATE INDEX "employee_quarter_questions_employeeId_quarterId_idx" ON "employee_quarter_questions"("employeeId", "quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_quarter_questions_employeeId_quarterId_questionId_key" ON "employee_quarter_questions"("employeeId", "quarterId", "questionId");

-- AddForeignKey
ALTER TABLE "department_role_mappings" ADD CONSTRAINT "department_role_mappings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_role_mappings" ADD CONSTRAINT "department_role_mappings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_quarter_questions" ADD CONSTRAINT "employee_quarter_questions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_quarter_questions" ADD CONSTRAINT "employee_quarter_questions_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_quarter_questions" ADD CONSTRAINT "employee_quarter_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
