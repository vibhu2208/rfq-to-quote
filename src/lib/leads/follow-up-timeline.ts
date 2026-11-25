import { formatTelemarketingInstant } from "@/lib/telemarketing/datetime";

function followUpKindLabel(type: string, title?: string) {
  const fromTitle = title?.trim();
  if (fromTitle) return fromTitle;
  const t = (type || "CALL").replace(/_/g, " ");
  if (/^call$/i.test(t)) return "Call";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Optimistic / UI timeline title when a follow-up is scheduled. */
export function followUpScheduledTimelineTitle(
  type: string,
  dueAt: Date,
  title?: string
) {
  const label = followUpKindLabel(type, title);
  const due = formatTelemarketingInstant(dueAt, { withTime: true });
  return `${label} scheduled — due ${due}`;
}

/** Optimistic / UI timeline title when a follow-up is completed. */
export function followUpCompletedTimelineTitle(type: string, title?: string) {
  const label = followUpKindLabel(type, title);
  return `${label} completed`;
}