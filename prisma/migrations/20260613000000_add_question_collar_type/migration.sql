-- Question.collarType: which employee category a question targets.
--   NULL           → applies to BOTH blue- and white-collar (shared default)
--   'WHITE_COLLAR' → white-collar employees only
--   'BLUE_COLLAR'  → blue-collar employees only
-- Nullable with no default, so every existing question becomes "shared"
-- (no behaviour change until an admin tags a question by category). The
-- "CollarType" enum already exists (added with the collar redesign), so this
-- migration only adds the column + a supporting index.
ALTER TABLE "questions" ADD COLUMN "collarType" "CollarType";

-- Speeds up the per-level + per-collar active-question lookups used at quarter
-- start and by the Stage 2/3 evaluator question endpoints.
CREATE INDEX "questions_level_collarType_isActive_idx" ON "questions"("level", "collarType", "isActive");
