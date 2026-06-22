-- CreateTable
CREATE TABLE "supervisor_evaluations" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selfContribution" DOUBLE PRECISION NOT NULL,
    "stage2CombinedScore" DOUBLE PRECISION NOT NULL,
    "supervisorContribution" DOUBLE PRECISION NOT NULL,
    "supervisorNormalized" DOUBLE PRECISION NOT NULL,
    "supervisorRawScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "supervisor_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervisor_evaluations_employeeId_idx" ON "supervisor_evaluations"("employeeId");

-- CreateIndex
CREATE INDEX "supervisor_evaluations_quarterId_idx" ON "supervisor_evaluations"("quarterId");

-- CreateIndex
CREATE INDEX "supervisor_evaluations_employeeId_quarterId_idx" ON "supervisor_evaluations"("employeeId", "quarterId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_evaluations_supervisorId_employeeId_quarterId_key" ON "supervisor_evaluations"("supervisorId", "employeeId", "quarterId");

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "quarters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_evaluations" ADD CONSTRAINT "supervisor_evaluations_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
