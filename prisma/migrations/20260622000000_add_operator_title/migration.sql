-- AlterTable: admin-named "page role" label for operators (e.g. "HR Admin").
ALTER TABLE "user_permissions" ADD COLUMN "operatorTitle" TEXT;
