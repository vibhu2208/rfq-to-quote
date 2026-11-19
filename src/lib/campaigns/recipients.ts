import type { CampaignRecipientMode } from "@prisma/client";
import { renderCampaignMessage, type TemplateVars } from "@/lib/campaigns/template";

export type RecipientSeed = {
  phone: string;
  name?: string;
  company?: string;
  email?: string;
  sourceRef?: string;
  contactId?: string;
  rfqId?: string;
};

export type CsvRecipientRow = {
  phone: string;
  name?: string;
  company?: string;
  email?: string;
};

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return digits;
}

export function dedupeRecipientsByPhone(seeds: RecipientSeed[]): RecipientSeed[] {
  const seen = new Set<string>();
  const out: RecipientSeed[] = [];
  for (const row of seeds) {
    const phone = normalizePhone(row.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ ...row, phone });
  }
  return out;
}

export function buildRecipientsFromCsvRows(
  rows: CsvRecipientRow[],
  messageTemplate: string
) {
  const seeds = dedupeRecipientsByPhone(
    rows.map((r) => ({
      phone: r.phone,
      name: r.name || "",
      company: r.company || "",
      email: r.email || "",
      sourceRef: "csv",
    }))
  );
  return seeds.map((seed) => ({
    ...seed,
    messageBody: renderCampaignMessage(messageTemplate, seed as TemplateVars),
  }));
}

export function buildRecipientsFromTelemarketing(
  contacts: Array<{
    id: string;
    phone: string;
    name: string;
    company: string;
    email: string;
  }>,
  messageTemplate: string,
  selectedIds?: string[]
) {
  const filtered = selectedIds?.length
    ? contacts.filter((c) => selectedIds.includes(c.id))
    : contacts;
  const seeds: RecipientSeed[] = filtered.map((c) => ({
    phone: c.phone,
    name: c.name,
    company: c.company,
    email: c.email,
    sourceRef: c.id,
    contactId: c.id,
  }));
  const unique = dedupeRecipientsByPhone(seeds);
  return unique.map((seed) => ({
    ...seed,
    messageBody: renderCampaignMessage(messageTemplate, seed as TemplateVars),
  }));
}

export function buildRecipientsFromLeads(
  leads: Array<{
    id: string;
    customerPhone: string;
    customerName: string;
    customerCompany: string;
    customerEmail: string;
  }>,
  messageTemplate: string,
  selectedIds?: string[]
) {
  const filtered = selectedIds?.length
    ? leads.filter((l) => selectedIds.includes(l.id))
    : leads;
  const seeds: RecipientSeed[] = filtered.map((l) => ({
    phone: l.customerPhone,
    name: l.customerName,
    company: l.customerCompany,
    email: l.customerEmail,
    sourceRef: l.id,
    rfqId: l.id,
  }));
  const unique = dedupeRecipientsByPhone(seeds);
  return unique.map((seed) => ({
    ...seed,
    messageBody: renderCampaignMessage(messageTemplate, seed as TemplateVars),
  }));
}

export type BuildRecipientsInput = {
  mode: CampaignRecipientMode;
  messageTemplate: string;
  telemarketingContacts?: Parameters<typeof buildRecipientsFromTelemarketing>[0];
  leads?: Parameters<typeof buildRecipientsFromLeads>[0];
  csvRows?: CsvRecipientRow[];
  selectedIds?: string[];
};

export function buildCampaignRecipients(input: BuildRecipientsInput) {
  switch (input.mode) {
    case "TELEMARKETING":
      return buildRecipientsFromTelemarketing(
        input.telemarketingContacts || [],
        input.messageTemplate,
        input.selectedIds
      );
    case "LEADS":
      return buildRecipientsFromLeads(
        input.leads || [],
        input.messageTemplate,
        input.selectedIds
      );
    case "CSV":
    default:
      return buildRecipientsFromCsvRows(input.csvRows || [], input.messageTemplate);
  }
}