-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'QUOTE_SENT', 'NEGOTIATION', 'CLOSED_WON', 'DISQUALIFIED', 'DEAL_LOST');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('HOT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('LEAD_CREATED', 'EMAIL_RECEIVED', 'EMAIL_SENT', 'WHATSAPP', 'CALL', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'QUOTE_GENERATED', 'QUOTE_SENT', 'QUOTE_VIEWED', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'STAGE_CHANGED', 'ASSIGNMENT_CHANGED', 'NOTE', 'SLA_BREACHED', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "LeadAssignmentRuleType" AS ENUM ('ROUND_ROBIN', 'CATEGORY', 'GEOGRAPHY', 'WORKLOAD');

-- AlterEnum
ALTER TYPE "RfqChannel" ADD VALUE IF NOT EXISTS 'REFERRAL';
ALTER TYPE "RfqChannel" ADD VALUE IF NOT EXISTS 'IMPORT';
ALTER TYPE "RfqChannel" ADD VALUE IF NOT EXISTS 'API';
ALTER TYPE "RfqChannel" ADD VALUE IF NOT EXISTS 'OTHER';

-- AlterTable Rfq: add CRM columns (leadNumber nullable first for backfill)
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "leadNumber" TEXT;
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "leadStage" "LeadStage" NOT NULL DEFAULT 'NEW_LEAD';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "partyId" TEXT;
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "expectedValue" DECIMAL(14,2);
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "expectedClosureAt" TIMESTAMP(3);
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "slaDueAt" TIMESTAMP(3);
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "slaBreachedAt" TIMESTAMP(3);
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "stageDetail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "disqualifyReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "lostReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "referralSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Rfq" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Backfill leadNumber for existing rows
UPDATE "Rfq" r
SET "leadNumber" = s.num
FROM (
  SELECT
    id,
    'L-' || to_char("createdAt", 'YYYY') || '-' || lpad((ROW_NUMBER() OVER (ORDER BY "createdAt", "id"))::text, 5, '0') AS num
  FROM "Rfq"
  WHERE "leadNumber" IS NULL
) s
WHERE r.id = s.id;

-- Backfill leadStage from RfqStatus + quote presence
UPDATE "Rfq" r
SET
  "leadStage" = CASE
    WHEN r.status = 'QUOTED' THEN 'QUOTE_SENT'::"LeadStage"
    WHEN r.status = 'CLOSED' AND EXISTS (SELECT 1 FROM "Quote" q WHERE q."rfqId" = r.id) THEN 'QUOTE_SENT'::"LeadStage"
    WHEN r.status = 'CLOSED' THEN 'DISQUALIFIED'::"LeadStage"
    WHEN r.status IN ('PARSED', 'NEEDS_REVIEW') THEN 'QUALIFIED'::"LeadStage"
    ELSE 'NEW_LEAD'::"LeadStage"
  END,
  "disqualifyReason" = CASE
    WHEN r.status = 'CLOSED' AND NOT EXISTS (SELECT 1 FROM "Quote" q WHERE q."rfqId" = r.id) THEN 'Migrated from closed RFQ'
    ELSE r."disqualifyReason"
  END,
  "category" = COALESCE(NULLIF(r."category", ''), COALESCE(r."parsedCategory", ''));

ALTER TABLE "Rfq" ALTER COLUMN "leadNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Rfq_leadNumber_key" ON "Rfq"("leadNumber");

CREATE INDEX IF NOT EXISTS "Rfq_leadStage_idx" ON "Rfq"("leadStage");
CREATE INDEX IF NOT EXISTS "Rfq_priority_idx" ON "Rfq"("priority");
CREATE INDEX IF NOT EXISTS "Rfq_assignedToUserId_idx" ON "Rfq"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "Rfq_organisationId_idx" ON "Rfq"("organisationId");
CREATE INDEX IF NOT EXISTS "Rfq_partyId_idx" ON "Rfq"("partyId");
CREATE INDEX IF NOT EXISTS "Rfq_nextFollowUpAt_idx" ON "Rfq"("nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "Rfq_slaDueAt_idx" ON "Rfq"("slaDueAt");
CREATE INDEX IF NOT EXISTS "Rfq_archivedAt_idx" ON "Rfq"("archivedAt");
CREATE INDEX IF NOT EXISTS "Rfq_customerEmail_idx" ON "Rfq"("customerEmail");
CREATE INDEX IF NOT EXISTS "Rfq_customerPhone_idx" ON "Rfq"("customerPhone");

ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LeadStageHistory
CREATE TABLE IF NOT EXISTS "LeadStageHistory" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "fromStage" "LeadStage",
  "toStage" "LeadStage" NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadStageHistory_rfqId_createdAt_idx" ON "LeadStageHistory"("rfqId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadStageHistory_toStage_idx" ON "LeadStageHistory"("toStage");
ALTER TABLE "LeadStageHistory" ADD CONSTRAINT "LeadStageHistory_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadStageHistory" ADD CONSTRAINT "LeadStageHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LeadActivity
CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "type" "LeadActivityType" NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "meta" JSONB NOT NULL DEFAULT '{}',
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadActivity_rfqId_createdAt_idx" ON "LeadActivity"("rfqId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadActivity_type_idx" ON "LeadActivity"("type");
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LeadFollowUp
CREATE TABLE IF NOT EXISTS "LeadFollowUp" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "type" "FollowUpType" NOT NULL DEFAULT 'CALL',
  "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "title" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "assignedToId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadFollowUp_rfqId_dueAt_idx" ON "LeadFollowUp"("rfqId", "dueAt");
CREATE INDEX IF NOT EXISTS "LeadFollowUp_status_dueAt_idx" ON "LeadFollowUp"("status", "dueAt");
CREATE INDEX IF NOT EXISTS "LeadFollowUp_assignedToId_dueAt_idx" ON "LeadFollowUp"("assignedToId", "dueAt");
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LeadOwnershipHistory
CREATE TABLE IF NOT EXISTS "LeadOwnershipHistory" (
  "id" TEXT NOT NULL,
  "rfqId" TEXT NOT NULL,
  "fromUserId" TEXT,
  "toUserId" TEXT,
  "actorId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadOwnershipHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadOwnershipHistory_rfqId_createdAt_idx" ON "LeadOwnershipHistory"("rfqId", "createdAt");
ALTER TABLE "LeadOwnershipHistory" ADD CONSTRAINT "LeadOwnershipHistory_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadOwnershipHistory" ADD CONSTRAINT "LeadOwnershipHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadOwnershipHistory" ADD CONSTRAINT "LeadOwnershipHistory_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadOwnershipHistory" ADD CONSTRAINT "LeadOwnershipHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SavedLeadView
CREATE TABLE IF NOT EXISTS "SavedLeadView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "columns" JSONB NOT NULL DEFAULT '[]',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedLeadView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SavedLeadView_userId_idx" ON "SavedLeadView"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "SavedLeadView_userId_name_key" ON "SavedLeadView"("userId", "name");
ALTER TABLE "SavedLeadView" ADD CONSTRAINT "SavedLeadView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LeadAssignmentRule
CREATE TABLE IF NOT EXISTS "LeadAssignmentRule" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT,
  "name" TEXT NOT NULL,
  "type" "LeadAssignmentRuleType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAssignmentRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadAssignmentRule_organisationId_active_priority_idx" ON "LeadAssignmentRule"("organisationId", "active", "priority");
ALTER TABLE "LeadAssignmentRule" ADD CONSTRAINT "LeadAssignmentRule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadAssignmentRule" ADD CONSTRAINT "LeadAssignmentRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed stage history for migrated leads
INSERT INTO "LeadStageHistory" ("id", "rfqId", "fromStage", "toStage", "reason", "createdAt")
SELECT
  'mig_' || r.id,
  r.id,
  NULL,
  r."leadStage",
  'Initial migration',
  r."createdAt"
FROM "Rfq" r
WHERE NOT EXISTS (SELECT 1 FROM "LeadStageHistory" h WHERE h."rfqId" = r.id);
