-- CreateEnum
CREATE TYPE "TelemarketingCallStatus" AS ENUM ('NO_ACTION', 'CONNECTED', 'CALL_BACK_REQUESTED', 'COULDNT_CONNECT', 'NOT_INTERESTED', 'MOVE_TO_LEAD');

-- CreateEnum
CREATE TYPE "TelemarketingContactSource" AS ENUM ('MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TelemarketingReminderType" AS ENUM ('CALL', 'WHATSAPP', 'MEETING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TelemarketingReminderStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelemarketingTimelineType" AS ENUM ('CONTACT_CREATED', 'CONTACT_IMPORTED', 'CONTACT_ASSIGNED', 'CALL_LOGGED', 'REMINDER_CREATED', 'REMINDER_COMPLETED', 'MARKED_AS_LEAD', 'STATUS_CHANGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CampaignLaunchMode" AS ENUM ('INSTANT', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "CampaignRecipientMode" AS ENUM ('TELEMARKETING', 'LEADS', 'CSV');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "TelemarketingContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "source" "TelemarketingContactSource" NOT NULL DEFAULT 'MANUAL',
    "callStatus" "TelemarketingCallStatus" NOT NULL DEFAULT 'NO_ACTION',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "assignedToUserId" TEXT,
    "primaryContactId" TEXT,
    "convertedLeadId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemarketingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemarketingCall" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "TelemarketingCallStatus" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "followUpAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemarketingCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemarketingReminder" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "TelemarketingReminderType" NOT NULL,
    "status" "TelemarketingReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedToUserId" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelemarketingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemarketingTimelineEvent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "TelemarketingTimelineType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemarketingTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL DEFAULT '',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "launchMode" "CampaignLaunchMode" NOT NULL DEFAULT 'INSTANT',
    "scheduledAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "recipientMode" "CampaignRecipientMode" NOT NULL DEFAULT 'CSV',
    "recipientFilter" JSONB NOT NULL DEFAULT '{}',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT NOT NULL DEFAULT '',
    "messageBody" TEXT NOT NULL DEFAULT '',
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "contactId" TEXT,
    "rfqId" TEXT,
    "replyText" TEXT NOT NULL DEFAULT '',
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemarketingContact_callStatus_idx" ON "TelemarketingContact"("callStatus");

-- CreateIndex
CREATE INDEX "TelemarketingContact_source_idx" ON "TelemarketingContact"("source");

-- CreateIndex
CREATE INDEX "TelemarketingContact_assignedToUserId_idx" ON "TelemarketingContact"("assignedToUserId");

-- CreateIndex
CREATE INDEX "TelemarketingContact_archivedAt_idx" ON "TelemarketingContact"("archivedAt");

-- CreateIndex
CREATE INDEX "TelemarketingContact_createdAt_idx" ON "TelemarketingContact"("createdAt");

-- CreateIndex
CREATE INDEX "TelemarketingContact_phone_idx" ON "TelemarketingContact"("phone");

-- CreateIndex
CREATE INDEX "TelemarketingContact_email_idx" ON "TelemarketingContact"("email");

-- CreateIndex
CREATE INDEX "TelemarketingContact_company_idx" ON "TelemarketingContact"("company");

-- CreateIndex
CREATE INDEX "TelemarketingContact_convertedLeadId_idx" ON "TelemarketingContact"("convertedLeadId");

-- CreateIndex
CREATE INDEX "TelemarketingContact_primaryContactId_idx" ON "TelemarketingContact"("primaryContactId");

-- CreateIndex
CREATE INDEX "TelemarketingCall_contactId_createdAt_idx" ON "TelemarketingCall"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemarketingReminder_contactId_dueAt_idx" ON "TelemarketingReminder"("contactId", "dueAt");

-- CreateIndex
CREATE INDEX "TelemarketingReminder_status_dueAt_idx" ON "TelemarketingReminder"("status", "dueAt");

-- CreateIndex
CREATE INDEX "TelemarketingReminder_assignedToUserId_dueAt_idx" ON "TelemarketingReminder"("assignedToUserId", "dueAt");

-- CreateIndex
CREATE INDEX "TelemarketingTimelineEvent_contactId_createdAt_idx" ON "TelemarketingTimelineEvent"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "Campaign_scheduledAt_idx" ON "Campaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_phone_idx" ON "CampaignRecipient"("phone");

-- CreateIndex
CREATE INDEX "CampaignRecipient_contactId_idx" ON "CampaignRecipient"("contactId");

-- AddForeignKey
ALTER TABLE "TelemarketingContact" ADD CONSTRAINT "TelemarketingContact_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingContact" ADD CONSTRAINT "TelemarketingContact_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "TelemarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingContact" ADD CONSTRAINT "TelemarketingContact_convertedLeadId_fkey" FOREIGN KEY ("convertedLeadId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingContact" ADD CONSTRAINT "TelemarketingContact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingCall" ADD CONSTRAINT "TelemarketingCall_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "TelemarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingCall" ADD CONSTRAINT "TelemarketingCall_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingReminder" ADD CONSTRAINT "TelemarketingReminder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "TelemarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingReminder" ADD CONSTRAINT "TelemarketingReminder_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingReminder" ADD CONSTRAINT "TelemarketingReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingTimelineEvent" ADD CONSTRAINT "TelemarketingTimelineEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "TelemarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemarketingTimelineEvent" ADD CONSTRAINT "TelemarketingTimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "TelemarketingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;