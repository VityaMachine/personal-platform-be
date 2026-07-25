-- Backfill legacy profiles before making displayName required.
UPDATE "Profile"
SET "displayName" = 'User'
WHERE "displayName" IS NULL OR btrim("displayName") = '';

-- AlterTable
ALTER TABLE "Profile"
ALTER COLUMN "displayName" SET NOT NULL;

-- Prevent empty or whitespace-only display names outside the registration flow.
ALTER TABLE "Profile"
ADD CONSTRAINT "Profile_displayName_not_empty" CHECK (btrim("displayName") <> '');
