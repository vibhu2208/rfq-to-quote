import type { TelemarketingCallStatus } from "@prisma/client";

export const TELEMARKETING_CALL_STATUSES: TelemarketingCallStatus[] = [
  "NO_ACTION",
  "CONNECTED",
  "CALL_BACK_REQUESTED",
  "COULDNT_CONNECT",
  "NOT_INTERESTED",
  "MOVE_TO_LEAD",
];

export const TELEMARKETING_CALL_STATUS_LABELS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "No action",
  CONNECTED: "Connected",
  CALL_BACK_REQUESTED: "Call Back Requested",
  COULDNT_CONNECT: "Couldn't Connect",
  NOT_INTERESTED: "Not Interested",
  MOVE_TO_LEAD: "Move to Lead",
};

export const LOG_CALL_STATUSES: TelemarketingCallStatus[] = [
  "CONNECTED",
  "CALL_BACK_REQUESTED",
  "COULDNT_CONNECT",
  "NOT_INTERESTED",
  "MOVE_TO_LEAD",
];

export const REMINDER_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "MEETING", label: "Meeting" },
  { value: "CUSTOM", label: "Custom" },
] as const;