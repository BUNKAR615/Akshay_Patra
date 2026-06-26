-- Stage Scheduling System — per-stage schedule, status & history for the
-- 5-stage evaluation workflow. Supersedes the AuditLog-based stage control;
-- the active quarter is backfilled lazily on first read (lib/stageScheduler.js).

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "quarter_stages" (
    "id" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarter_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_status_history" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "fromStatus" "StageStatus",
    "toStatus" "StageStatus" NOT NULL,
    "event" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "actorId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quarter_stages_quarterId_idx" ON "quarter_stages"("quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_stages_quarterId_stageNumber_key" ON "quarter_stages"("quarterId", "stageNumber");

-- CreateIndex
CREATE INDEX "stage_status_history_quarterId_stageNumber_idx" ON "stage_status_history"("quarterId", "stageNumber");

-- CreateIndex
CREATE INDEX "stage_status_history_stageId_idx" ON "stage_status_history"("stageId");

-- AddForeignKey
ALTER TABLE "quarter_stages" ADD CONSTRAINT "quarter_stages_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_status_history" ADD CONSTRAINT "stage_status_history_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "quarter_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
