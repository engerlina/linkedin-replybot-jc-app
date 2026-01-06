-- Fix missing columns (safe to run multiple times)

-- Add linkedApiKey to Settings if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Settings' AND column_name = 'linkedApiKey') THEN
        ALTER TABLE "Settings" ADD COLUMN "linkedApiKey" TEXT;
    END IF;
END $$;

-- Check and rename linkedApiToken to identificationToken if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LinkedInAccount' AND column_name = 'linkedApiToken') THEN
        ALTER TABLE "LinkedInAccount" RENAME COLUMN "linkedApiToken" TO "identificationToken";
        DROP INDEX IF EXISTS "LinkedInAccount_linkedApiToken_key";
        CREATE UNIQUE INDEX IF NOT EXISTS "LinkedInAccount_identificationToken_key" ON "LinkedInAccount"("identificationToken");
    END IF;
END $$;

-- Add autoReply to MonitoredPost if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MonitoredPost' AND column_name = 'autoReply') THEN
        ALTER TABLE "MonitoredPost" ADD COLUMN "autoReply" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Add autoComment to WatchedAccount if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'WatchedAccount' AND column_name = 'autoComment') THEN
        ALTER TABLE "WatchedAccount" ADD COLUMN "autoComment" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Create PendingReply table if not exists
CREATE TABLE IF NOT EXISTS "PendingReply" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commenterUrl" TEXT NOT NULL,
    "commenterName" TEXT NOT NULL,
    "commenterHeadline" TEXT,
    "commentText" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "generatedReply" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "editedText" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingReply_pkey" PRIMARY KEY ("id")
);

-- Create PendingComment table if not exists
CREATE TABLE IF NOT EXISTS "PendingComment" (
    "id" TEXT NOT NULL,
    "watchedAccountId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "postText" TEXT,
    "generatedComment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "editedText" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingComment_pkey" PRIMARY KEY ("id")
);

-- Add indexes if not exist
CREATE INDEX IF NOT EXISTS "PendingReply_status_idx" ON "PendingReply"("status");
CREATE INDEX IF NOT EXISTS "PendingReply_postId_status_idx" ON "PendingReply"("postId", "status");
CREATE INDEX IF NOT EXISTS "PendingComment_status_idx" ON "PendingComment"("status");
CREATE INDEX IF NOT EXISTS "PendingComment_watchedAccountId_status_idx" ON "PendingComment"("watchedAccountId", "status");

-- Add foreign keys if not exist (ignore errors if already exist)
DO $$
BEGIN
    ALTER TABLE "PendingReply" ADD CONSTRAINT "PendingReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MonitoredPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "PendingComment" ADD CONSTRAINT "PendingComment_watchedAccountId_fkey" FOREIGN KEY ("watchedAccountId") REFERENCES "WatchedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
