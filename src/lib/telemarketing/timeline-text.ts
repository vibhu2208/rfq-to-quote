import { formatTelemarketingInstant } from "@/lib/telemarketing/datetime";

const ISO_IN_TEXT =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?/g;

/** Replace raw ISO timestamps embedded in timeline copy with IST-friendly labels. */
export function formatTelemarketingTimelineText(text: string): string {
  if (!text) return text;
  return text.replace(ISO_IN_TEXT, (iso) => {
    const formatted = formatTelemarketingInstant(iso, { withTime: true });
    return formatted || iso;
  });
}