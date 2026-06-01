-- Add question-selection mode controls
-- Quarter.questionSelectionMode: AUTO (system picks a random, category-balanced
--   set at quarter start) vs MANUAL (use exactly the admin-curated questions).
ALTER TABLE "quarters" ADD COLUMN "questionSelectionMode" TEXT NOT NULL DEFAULT 'AUTO';

-- Question.includedInQuarter: whether this question is locked into a quarter
-- that is started in MANUAL mode. Ignored in AUTO mode.
ALTER TABLE "questions" ADD COLUMN "includedInQuarter" BOOLEAN NOT NULL DEFAULT true;
