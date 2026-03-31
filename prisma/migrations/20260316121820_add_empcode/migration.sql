/*
  Warnings:

  - A unique constraint covering the columns `[empCode]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "empCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_empCode_key" ON "users"("empCode");
