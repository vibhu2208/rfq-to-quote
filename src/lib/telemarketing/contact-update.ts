import type { TelemarketingContact, TelemarketingCallStatus } from "@prisma/client";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

export type ContactFieldKey = "name" | "company" | "role" | "phone" | "email";

const FIELD_LABELS: Record<ContactFieldKey, string> = {
  name: "Name",
  company: "Company",
  role: "Role",
  phone: "Phone",
  email: "Email",
};

export function displayFieldValue(value: string) {
  const t = value.trim();
  return t || "—";
}

export function buildFieldUpdateBody(field: ContactFieldKey, from: string, to: string) {
  return `${FIELD_LABELS[field]} updated: ${displayFieldValue(from)} → ${displayFieldValue(to)}`;
}

export function buildStatusChangeBody(
  from: TelemarketingCallStatus,
  to: TelemarketingCallStatus
) {
  const fromLabel = TELEMARKETING_CALL_STATUS_LABELS[from];
  const toLabel = TELEMARKETING_CALL_STATUS_LABELS[to];
  return `Status changed: ${fromLabel} → ${toLabel}`;
}

export function parseTagsJson(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeTagsInput(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function buildTagsUpdateBody(before: string[], after: string[]) {
  const prev = before.length ? before.join(", ") : "—";
  const next = after.length ? after.join(", ") : "—";
  return `Tags updated: ${prev} → ${next}`;
}

export function pickContactScalars(
  contact: Pick<TelemarketingContact, ContactFieldKey | "callStatus" | "tags">
) {
  return {
    name: contact.name,
    company: contact.company,
    role: contact.role,
    phone: contact.phone,
    email: contact.email,
    callStatus: contact.callStatus,
    tags: parseTagsJson(contact.tags as unknown),
  };
}