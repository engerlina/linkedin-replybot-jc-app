-- AlterTable: Make profileUrl optional and move unique constraint to linkedApiToken
ALTER TABLE "LinkedInAccount" ALTER COLUMN "profileUrl" DROP NOT NULL;

-- Drop unique constraint on profileUrl
DROP INDEX IF EXISTS "LinkedInAccount_profileUrl_key";

-- Add unique constraint on linkedApiToken
CREATE UNIQUE INDEX "LinkedInAccount_linkedApiToken_key" ON "LinkedInAccount"("linkedApiToken");
