import { formatDistanceToNowStrict } from "date-fns";
import type { LeadRow } from "@/components/leads/types";
import type { LeadColumnId } from "@/lib/leads/constants";

export const COLUMN_LABELS: Record<LeadColumnId, string> = {
  leadId: "Lead / Source",
  leadContact: "Contact",
  requirement: "Requirement",
  stage: "Stage",
  priority: "Priority",
  quoteDetails: "Quotes",
  assignedTo: "Owner",
  expected: "Expected",
  nextFollowUp: "Follow-up",
  sla: "SLA",
  actions: "Actions",
};

/** Per-column table classes: fixed layout + hide secondary cols on smaller screens. */
export const COLUMN_CELL_CLASS: Record<LeadColumnId, string> = {
  leadId: "min-w-0 w-[26%] overflow-hidden sm:w-[16%] lg:w-[13%]",
  leadContact: "min-w-0 w-[30%] overflow-hidden sm:w-[20%] lg:w-[16%]",
  requirement: "min-w-0 w-[22%] overflow-hidden sm:w-[14%] lg:w-[12%]",
  stage: "min-w-0 w-[14%] overflow-hidden sm:w-[12%] lg:w-[10%]",
  priority: "hidden min-w-0 overflow-hidden sm:table-cell sm:w-[9%] lg:w-[7%]",
  quoteDetails: "hidden min-w-0 overflow-visible sm:table-cell sm:w-[15%] lg:w-[12%]",
  assignedTo: "hidden min-w-0 overflow-hidden lg:table-cell lg:w-[9%]",
  expected: "hidden min-w-0 overflow-hidden lg:table-cell lg:w-[8%]",
  nextFollowUp: "hidden min-w-0 overflow-hidden md:table-cell md:w-[9%] lg:w-[8%]",
  sla: "hidden min-w-0 overflow-hidden xl:table-cell xl:w-[5%]",
  actions: "min-w-0 w-[14%] overflow-hidden sm:w-[12%] lg:w-[10%]",
};

export function isQuoteActivity(type: string, title: string) {
  return (
    type.startsWith("QUOTE_") ||
    /\bquote\b/i.test(title) ||
    /\bquotation\b/i.test(title)
  );
}

export function recentActivityItems(row: LeadRow) {
  const activities = row.activities || [];
  const quoteActivities = activities.filter((a) =>
    isQuoteActivity(a.type, a.title || "")
  );
  const items =
    quoteActivities.length > 0 ? quoteActivities : activities;
  return items.slice(0, 20);
}

export function fixedPopoverCoords(
  el: HTMLElement,
  width: number,
  estimatedHeight: number
) {
  const rect = el.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow < estimatedHeight && rect.top > estimatedHeight
      ? Math.max(12, rect.top - estimatedHeight - 6)
      : rect.bottom + 6;
  return { top, left: Math.max(12, left) };
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function money(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function slaLabel(row: LeadRow) {
  if (!row.slaDueAt) return "—";
  const due = new Date(row.slaDueAt).getTime();
  const now = Date.now();
  if (row.slaBreachedAt || due < now) return "Overdue";
  return "Pending";
}
