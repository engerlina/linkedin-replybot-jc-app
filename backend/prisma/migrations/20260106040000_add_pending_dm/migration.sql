-- Add defaultDmTemplate to Settings
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "defaultDmTemplate" TEXT;

-- Create PendingDm table
CREATE TABLE IF NOT EXISTS "PendingDm" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "editedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingDm_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "PendingDm_status_idx" ON "PendingDm"("status");
CREATE INDEX IF NOT EXISTS "PendingDm_leadId_status_idx" ON "PendingDm"("leadId", "status");

-- Add foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'PendingDm_leadId_fkey'
    ) THEN
        ALTER TABLE "PendingDm" ADD CONSTRAINT "PendingDm_leadId_fkey"
        FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
