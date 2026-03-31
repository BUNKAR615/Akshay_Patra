-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "branchManagerId" TEXT,
ADD COLUMN     "supervisorId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "designation" TEXT;

-- CreateTable
CREATE TABLE "department_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "department_roles_departmentId_idx" ON "department_roles"("departmentId");

-- CreateIndex
CREATE INDEX "department_roles_userId_idx" ON "department_roles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "department_roles_userId_departmentId_role_key" ON "department_roles"("userId", "departmentId", "role");

-- AddForeignKey
ALTER TABLE "department_roles" ADD CONSTRAINT "department_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_roles" ADD CONSTRAINT "department_roles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
