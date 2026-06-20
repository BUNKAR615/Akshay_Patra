-- AlterTable
ALTER TABLE "external_registrants" ADD COLUMN     "accessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "external_registrants_accessToken_key" ON "external_registrants"("accessToken");

