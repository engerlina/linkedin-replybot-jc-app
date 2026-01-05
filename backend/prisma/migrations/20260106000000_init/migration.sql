-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "linkedApiToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "voiceTone" TEXT NOT NULL DEFAULT 'professional',
    "voiceTopics" TEXT[],
    "sampleComments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "postTitle" TEXT,
    "keywords" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ctaType" TEXT NOT NULL,
    "ctaValue" TEXT NOT NULL,
    "ctaMessage" TEXT,
    "replyStyle" TEXT,
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "totalMatches" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commenterUrl" TEXT NOT NULL,
    "commenterName" TEXT NOT NULL,
    "commenterHeadline" TEXT,
    "commentText" TEXT NOT NULL,
    "commentTime" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "wasMatch" BOOLEAN NOT NULL DEFAULT false,
    "repliedAt" TIMESTAMP(3),
    "replyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchedAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetHeadline" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "commentStyle" TEXT,
    "topicsToEngage" TEXT[],
    "checkIntervalMins" INTEGER NOT NULL DEFAULT 30,
    "lastCheckedAt" TIMESTAMP(3),
    "totalEngagements" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "watchedAccountId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "postText" TEXT,
    "postTime" TIMESTAMP(3),
    "reacted" BOOLEAN NOT NULL DEFAULT false,
    "reactionType" TEXT,
    "commented" BOOLEAN NOT NULL DEFAULT false,
    "commentText" TEXT,
    "engagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postId" TEXT,
    "linkedInUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "sourceKeyword" TEXT,
    "sourcePostUrl" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'unknown',
    "connectionSentAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "dmStatus" TEXT NOT NULL DEFAULT 'not_sent',
    "dmSentAt" TIMESTAMP(3),
    "dmText" TEXT,
    "ctaSent" BOOLEAN NOT NULL DEFAULT false,
    "ctaSentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "referenceId" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "maxDailyComments" INTEGER NOT NULL DEFAULT 50,
    "maxDailyConnections" INTEGER NOT NULL DEFAULT 25,
    "maxDailyMessages" INTEGER NOT NULL DEFAULT 100,
    "minDelaySeconds" INTEGER NOT NULL DEFAULT 60,
    "maxDelaySeconds" INTEGER NOT NULL DEFAULT 300,
    "replyBotIntervalMins" INTEGER NOT NULL DEFAULT 10,
    "commentBotIntervalMins" INTEGER NOT NULL DEFAULT 30,
    "connectionCheckMins" INTEGER NOT NULL DEFAULT 60,
    "replyBotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commentBotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInAccount_profileUrl_key" ON "LinkedInAccount"("profileUrl");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredPost_postUrl_key" ON "MonitoredPost"("postUrl");

-- CreateIndex
CREATE INDEX "ProcessedComment_postId_wasMatch_idx" ON "ProcessedComment"("postId", "wasMatch");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedComment_postId_commenterUrl_commentText_key" ON "ProcessedComment"("postId", "commenterUrl", "commentText");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedAccount_accountId_targetUrl_key" ON "WatchedAccount"("accountId", "targetUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_watchedAccountId_postUrl_key" ON "Engagement"("watchedAccountId", "postUrl");

-- CreateIndex
CREATE INDEX "Lead_connectionStatus_idx" ON "Lead"("connectionStatus");

-- CreateIndex
CREATE INDEX "Lead_dmStatus_idx" ON "Lead"("dmStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_accountId_linkedInUrl_key" ON "Lead"("accountId", "linkedInUrl");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_jobType_status_idx" ON "ScheduledJob"("jobType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_accountId_actionType_date_key" ON "RateLimit"("accountId", "actionType", "date");

-- CreateIndex
CREATE INDEX "ActivityLog_accountId_createdAt_idx" ON "ActivityLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "MonitoredPost" ADD CONSTRAINT "MonitoredPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedComment" ADD CONSTRAINT "ProcessedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MonitoredPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchedAccount" ADD CONSTRAINT "WatchedAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_watchedAccountId_fkey" FOREIGN KEY ("watchedAccountId") REFERENCES "WatchedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MonitoredPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
