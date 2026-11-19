import type { CampaignStatus } from "@prisma/client";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "PAUSED",
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  PAUSED: "Paused",
};