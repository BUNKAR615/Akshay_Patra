-- AddBranchSlug: add a human-readable URL slug to the Branch model
-- Adds slug as nullable, backfills from name, then enforces NOT NULL + UNIQUE

ALTER TABLE "branches" ADD COLUMN "slug" TEXT;

-- Backfill: lowercase name, spaces → hyphens, strip non-slug chars
UPDATE "branches"
SET "slug" = LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE("name", '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
));

-- Now enforce NOT NULL
ALTER TABLE "branches" ALTER COLUMN "slug" SET NOT NULL;

-- Add unique index (Prisma convention)
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");
