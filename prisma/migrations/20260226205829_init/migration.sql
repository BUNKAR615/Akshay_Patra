-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'SUPERVISOR', 'BRANCH_MANAGER', 'CLUSTER_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuarterStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('ATTENDANCE', 'DISCIPLINE', 'PRODUCTIVITY', 'TEAMWORK', 'INITIATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "EvaluationLevel" AS ENUM ('SELF', 'SUPERVISOR', 'BRANCH_MANAGER', 'CLUSTER_MANAGER');

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "QuarterStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "level" "EvaluationLevel" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarter_questions" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarter_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_evaluations" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "supervisorScore" DOUBLE PRECISION NOT NULL,
    "combinedScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_manager_evaluations" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "bmScore" DOUBLE PRECISION NOT NULL,
    "combinedScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_manager_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cluster_manager_evaluations" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "cmScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cluster_manager_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_stage1" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "selfScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortlist_stage1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_stage2" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "selfScore" DOUBLE PRECISION NOT NULL,
    "supervisorScore" DOUBLE PRECISION NOT NULL,
    "combinedScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortlist_stage2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_stage3" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "selfScore" DOUBLE PRECISION NOT NULL,
    "supervisorScore" DOUBLE PRECISION NOT NULL,
    "bmScore" DOUBLE PRECISION NOT NULL,
    "combinedScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shortlist_stage3_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "best_employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "selfScore" DOUBLE PRECISION NOT NULL,
    "supervisorScore" DOUBLE PRECISION NOT NULL,
    "bmScore" DOUBLE PRECISION NOT NULL,
    "cmScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "best_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklisted_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklisted_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "departments_branchId_idx" ON "departments"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_branchId_key" ON "departments"("name", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "quarters_name_key" ON "quarters"("name");

-- CreateIndex
CREATE INDEX "questions_category_idx" ON "questions"("category");

-- CreateIndex
CREATE INDEX "questions_level_idx" ON "questions"("level");

-- CreateIndex
CREATE INDEX "quarter_questions_quarterId_idx" ON "quarter_questions"("quarterId");

-- CreateIndex
CREATE INDEX "quarter_questions_questionId_idx" ON "quarter_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_questions_quarterId_questionId_key" ON "quarter_questions"("quarterId", "questionId");

-- CreateIndex
CREATE INDEX "self_assessments_quarterId_idx" ON "self_assessments"("quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "self_assessments_userId_quarterId_key" ON "self_assessments"("userId", "quarterId");

-- CreateIndex
CREATE INDEX "supervisor_evaluations_employeeId_idx" ON "supervisor_evaluations"("employeeId");

-- CreateIndex
CREATE INDEX "supervisor_evaluations_quarterId_idx" ON "supervisor_evaluations"("quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_evaluations_supervisorId_employeeId_quarterId_key" ON "supervisor_evaluations"("supervisorId", "employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "branch_manager_evaluations_employeeId_idx" ON "branch_manager_evaluations"("employeeId");

-- CreateIndex
CREATE INDEX "branch_manager_evaluations_quarterId_idx" ON "branch_manager_evaluations"("quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_manager_evaluations_managerId_employeeId_quarterId_key" ON "branch_manager_evaluations"("managerId", "employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "cluster_manager_evaluations_employeeId_idx" ON "cluster_manager_evaluations"("employeeId");

-- CreateIndex
CREATE INDEX "cluster_manager_evaluations_quarterId_idx" ON "cluster_manager_evaluations"("quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_manager_evaluations_clusterId_employeeId_quarterId_key" ON "cluster_manager_evaluations"("clusterId", "employeeId", "quarterId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "shortlist_stage1_quarterId_idx" ON "shortlist_stage1"("quarterId");

-- CreateIndex
CREATE INDEX "shortlist_stage1_departmentId_idx" ON "shortlist_stage1"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage1_userId_quarterId_key" ON "shortlist_stage1"("userId", "quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage1_departmentId_quarterId_rank_key" ON "shortlist_stage1"("departmentId", "quarterId", "rank");

-- CreateIndex
CREATE INDEX "shortlist_stage2_quarterId_idx" ON "shortlist_stage2"("quarterId");

-- CreateIndex
CREATE INDEX "shortlist_stage2_departmentId_idx" ON "shortlist_stage2"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage2_userId_quarterId_key" ON "shortlist_stage2"("userId", "quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage2_departmentId_quarterId_rank_key" ON "shortlist_stage2"("departmentId", "quarterId", "rank");

-- CreateIndex
CREATE INDEX "shortlist_stage3_quarterId_idx" ON "shortlist_stage3"("quarterId");

-- CreateIndex
CREATE INDEX "shortlist_stage3_departmentId_idx" ON "shortlist_stage3"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage3_userId_quarterId_key" ON "shortlist_stage3"("userId", "quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_stage3_departmentId_quarterId_rank_key" ON "shortlist_stage3"("departmentId", "quarterId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "best_employees_quarterId_key" ON "best_employees"("quarterId");

-- CreateIndex
CREATE INDEX "best_employees_userId_idx" ON "best_employees"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blacklisted_tokens_token_key" ON "blacklisted_tokens"("token");

-- CreateIndex
CREATE INDEX "blacklisted_tokens_token_idx" ON "blacklisted_tokens"("token");

-- CreateIndex
CREATE INDEX "blacklisted_tokens_expiresAt_idx" ON "blacklisted_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_questions" ADD CONSTRAINT "quarter_questions_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_questions" ADD CONSTRAINT "quarter_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_assessments" ADD CONSTRAINT "self_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_assessments" ADD CONSTRAINT "self_assessments_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_manager_evaluations" ADD CONSTRAINT "branch_manager_evaluations_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_manager_evaluations" ADD CONSTRAINT "branch_manager_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_manager_evaluations" ADD CONSTRAINT "branch_manager_evaluations_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_manager_evaluations" ADD CONSTRAINT "cluster_manager_evaluations_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_manager_evaluations" ADD CONSTRAINT "cluster_manager_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_manager_evaluations" ADD CONSTRAINT "cluster_manager_evaluations_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage1" ADD CONSTRAINT "shortlist_stage1_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage1" ADD CONSTRAINT "shortlist_stage1_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage1" ADD CONSTRAINT "shortlist_stage1_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage2" ADD CONSTRAINT "shortlist_stage2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage2" ADD CONSTRAINT "shortlist_stage2_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage2" ADD CONSTRAINT "shortlist_stage2_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage3" ADD CONSTRAINT "shortlist_stage3_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage3" ADD CONSTRAINT "shortlist_stage3_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_stage3" ADD CONSTRAINT "shortlist_stage3_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "best_employees" ADD CONSTRAINT "best_employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "best_employees" ADD CONSTRAINT "best_employees_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "best_employees" ADD CONSTRAINT "best_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
