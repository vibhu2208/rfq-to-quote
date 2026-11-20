import { QUOTE_TIME_ZONE, formatQuoteInstant } from "@/lib/quote-format";
import type { TelemarketingCallStatus } from "@prisma/client";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";
import { callStatusLabelForTimeline } from "@/lib/telemarketing/move-to-lead";

/** Display telemarketing dates/times in IST (India). */
export function formatTelemarketingInstant(
  date: Date | string | number | null | undefined,
  opts?: { withTime?: boolean }
): string {
  if (date == null || date === "") return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  if (!opts?.withTime) {
    return formatQuoteInstant(d, "dd MMM yyyy", QUOTE_TIME_ZONE);
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: QUOTE_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toUpperCase();

  if (!day || !month || !year) return "";
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}

export function formatFollowUpTimelineBody(dueAt: Date): string {
  return `Call follow-up at ${formatTelemarketingInstant(dueAt, { withTime: true })}`;
}

export function buildCallLoggedTimelineBody(status: TelemarketingCallStatus, note: string) {
  const outcome = callStatusLabelForTimeline(status);
  const trimmed = note.trim();
  if (!trimmed) return `Call outcome: ${outcome}`;
  return `Call outcome: ${outcome}\n${trimmed}`;
}

export { validateFutureDateTime } from "@/lib/datetime/future-datetime";

export function defaultLogCallStatus(
  contactStatus: TelemarketingCallStatus
): TelemarketingCallStatus {
  const loggable: TelemarketingCallStatus[] = [
    "CONNECTED",
    "CALL_BACK_REQUESTED",
    "COULDNT_CONNECT",
    "NOT_INTERESTED",
    "MOVE_TO_LEAD",
  ];
  if (loggable.includes(contactStatus)) return contactStatus;
  return "CONNECTED";
}

export function reminderNotesForCallback() {
  return `Callback requested (${TELEMARKETING_CALL_STATUS_LABELS.CALL_BACK_REQUESTED})`;
}