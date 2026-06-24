-- Remove the legacy department-level collar tag.
--
-- Collar is now stored per-employee only (users."collarType"). The department
-- column was a leftover default/fallback. Before dropping it we copy the
-- department's collar onto any EMPLOYEE that was still relying on the fallback
-- (their own collarType is NULL), so effective-collar behaviour — and therefore
-- per-collar question assignment and the big-branch evaluation pipeline — is
-- preserved exactly.
UPDATE "users" u
SET "collarType" = d."collarType"
FROM "departments" d
WHERE u."departmentId" = d.id
  AND u."collarType" IS NULL
  AND u."role" = 'EMPLOYEE';

-- Department collar tag is removed; collar is per-employee from here on.
-- The "CollarType" enum stays — it is still used by users, questions, and the
-- branch shortlist tables.
ALTER TABLE "departments" DROP COLUMN "collarType";
