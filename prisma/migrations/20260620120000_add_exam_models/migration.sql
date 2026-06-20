-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ExamQuestionType" AS ENUM ('SINGLE', 'MULTIPLE', 'SHORT', 'LONG', 'RATING');

-- CreateEnum
CREATE TYPE "ExamAudienceMode" AS ENUM ('ALL', 'BRANCH', 'DEPT', 'BM', 'RM', 'RANDOM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExamInviteStatus" AS ENUM ('INVITED', 'STARTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimitMin" INTEGER,
    "passMark" INTEGER NOT NULL DEFAULT 70,
    "dueDate" TIMESTAMP(3),
    "shuffle" BOOLEAN NOT NULL DEFAULT true,
    "showResults" BOOLEAN NOT NULL DEFAULT false,
    "requireCompletion" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "ExamQuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "hint" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_choices" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exam_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_audiences" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "mode" "ExamAudienceMode" NOT NULL,
    "branchId" TEXT,
    "departmentId" TEXT,
    "role" TEXT,
    "randomCount" INTEGER,
    "customRules" JSONB,
    "recipients" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_invites" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "ExamInviteStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_responses" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "marks" DOUBLE PRECISION,
    "rank" INTEGER,
    "timeTakenSec" INTEGER,

    CONSTRAINT "exam_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceIds" TEXT[],
    "textValue" TEXT,
    "ratingValue" INTEGER,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "exams_createdById_idx" ON "exams"("createdById");

-- CreateIndex
CREATE INDEX "exam_questions_examId_idx" ON "exam_questions"("examId");

-- CreateIndex
CREATE INDEX "exam_choices_questionId_idx" ON "exam_choices"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_audiences_examId_key" ON "exam_audiences"("examId");

-- CreateIndex
CREATE INDEX "exam_invites_examId_status_idx" ON "exam_invites"("examId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_invites_examId_employeeId_key" ON "exam_invites"("examId", "employeeId");

-- CreateIndex
CREATE INDEX "exam_responses_examId_idx" ON "exam_responses"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_responses_examId_employeeId_key" ON "exam_responses"("examId", "employeeId");

-- CreateIndex
CREATE INDEX "exam_answers_responseId_idx" ON "exam_answers"("responseId");

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_choices" ADD CONSTRAINT "exam_choices_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_audiences" ADD CONSTRAINT "exam_audiences_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_invites" ADD CONSTRAINT "exam_invites_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_responses" ADD CONSTRAINT "exam_responses_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "exam_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

