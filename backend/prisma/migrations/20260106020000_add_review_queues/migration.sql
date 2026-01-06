-- Rename linkedApiToken to identificationToken
ALTER TABLE "LinkedInAccount" RENAME COLUMN "linkedApiToken" TO "identificationToken";

-- Drop and recreate the unique index with new name
DROP INDEX IF EXISTS "LinkedInAccount_linkedApiToken_key";
CREATE UNIQUE INDEX "LinkedInAccount_identificationToken_key" ON "LinkedInAccount"("identificationToken");

-- Add autoReply to MonitoredPost
ALTER TABLE "MonitoredPost" ADD COLUMN "autoReply" BOOLEAN NOT NULL DEFAULT false;

-- Add autoComment to WatchedAccount
ALTER TABLE "WatchedAccount" ADD COLUMN "autoComment" BOOLEAN NOT NULL DEFAULT false;

-- Create PendingReply table
CREATE TABLE "PendingReply" (
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

-- Create PendingComment table
CREATE TABLE "PendingComment" (
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

-- Add indexes
CREATE INDEX "PendingReply_status_idx" ON "PendingReply"("status");
CREATE INDEX "PendingReply_postId_status_idx" ON "PendingReply"("postId", "status");
CREATE INDEX "PendingComment_status_idx" ON "PendingComment"("status");
CREATE INDEX "PendingComment_watchedAccountId_status_idx" ON "PendingComment"("watchedAccountId", "status");

-- Add foreign keys
ALTER TABLE "PendingReply" ADD CONSTRAINT "PendingReply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MonitoredPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingComment" ADD CONSTRAINT "PendingComment_watchedAccountId_fkey" FOREIGN KEY ("watchedAccountId") REFERENCES "WatchedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
