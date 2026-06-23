-- Questions are now free-form: the per-category quota/restriction feature was
-- removed. Two changes:
--
-- 1) Drop the NOT NULL on questions.category. The category/topic concept is no
--    longer required (or surfaced in the admin UI). New questions store NULL;
--    the column stays only so old audit-log details / historical reports keep
--    resolving. The "QuestionCategory" enum is intentionally left in place.
--
-- 2) Wipe the existing question bank so the Questions section starts fresh.
--    This cascades through the FKs (ON DELETE CASCADE) and therefore also
--    clears quarter_questions and employee_quarter_questions. Self-assessment
--    answers (stored as JSON, no FK) are untouched. This is a one-time reset
--    requested as part of the restriction removal.

-- 1) Make category optional
ALTER TABLE "questions" ALTER COLUMN "category" DROP NOT NULL;

-- 2) Fresh start — remove all existing questions (cascades to quarter_questions
--    and employee_quarter_questions).
DELETE FROM "questions";
