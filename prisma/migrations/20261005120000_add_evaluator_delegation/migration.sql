-- Department-scoped evaluator delegation ("Power of Attorney").
-- Purely ADDITIVE: one new table + three boolean columns defaulting to false.
-- No existing row, score, shortlist or winner is modified; historical
-- evaluations read viaDelegation=false (they were all branch-default).

-- AlterTable
ALTER TABLE "branch_manager_evaluations" ADD COLUMN     "viaDelegation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cluster_manager_evaluations" ADD COLUMN     "viaDelegation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "hr_evaluations" ADD COLUMN     "viaDelegation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "evaluator_delegations" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "evaluatorType" "Role" NOT NULL,
    "evaluatorUserId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluator_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluator_delegations_evaluatorUserId_evaluatorType_idx" ON "evaluator_delegations"("evaluatorUserId", "evaluatorType");

-- CreateIndex
CREATE INDEX "evaluator_delegations_branchId_evaluatorType_idx" ON "evaluator_delegations"("branchId", "evaluatorType");

-- CreateIndex
CREATE UNIQUE INDEX "evaluator_delegations_departmentId_evaluatorType_slotKey_key" ON "evaluator_delegations"("departmentId", "evaluatorType", "slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "evaluator_delegations_departmentId_evaluatorType_evaluatorU_key" ON "evaluator_delegations"("departmentId", "evaluatorType", "evaluatorUserId");

-- AddForeignKey
ALTER TABLE "evaluator_delegations" ADD CONSTRAINT "evaluator_delegations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluator_delegations" ADD CONSTRAINT "evaluator_delegations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluator_delegations" ADD CONSTRAINT "evaluator_delegations_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

