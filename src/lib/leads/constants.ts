import type {
  LeadIntakeKind,
  LeadStage,
  LeadPriority,
  RfqChannel,
} from "@prisma/client";

export const LEAD_INTAKE_KINDS: LeadIntakeKind[] = [
  "REQUIREMENT",
  "JUNK",
  "SKIPPED",
];

export const LEAD_INTAKE_LABELS: Record<LeadIntakeKind, string> = {
  REQUIREMENT: "Requirements",
  JUNK: "Junk",
  SKIPPED: "Skipped",
};

export const LEAD_STAGES: LeadStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
  "NEGOTIATION",
  "CLOSED_WON",
  "DISQUALIFIED",
  "DEAL_LOST",
];

export const TERMINAL_STAGES: LeadStage[] = [
  "CLOSED_WON",
  "DISQUALIFIED",
  "DEAL_LOST",
];

/** Happy-path qualification flow (left → right). */
export const PROCESS_STAGES: LeadStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
  "NEGOTIATION",
  "CLOSED_WON",
];

/** Exit outcomes off the main path. */
export const EXIT_STAGES: LeadStage[] = ["DISQUALIFIED", "DEAL_LOST"];

export const OPEN_STAGES: LeadStage[] = LEAD_STAGES.filter(
  (s) => !TERMINAL_STAGES.includes(s)
);

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTE_SENT: "Quote sent",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed won",
  DISQUALIFIED: "Disqualified",
  DEAL_LOST: "Deal lost",
};

export const LEAD_STAGE_HINTS: Record<LeadStage, string> = {
  NEW_LEAD: "Just received — first touch pending",
  CONTACTED: "Reached out; waiting on response",
  QUALIFIED: "Fit confirmed; ready to quote",
  QUOTE_SENT: "Quotation shared with customer",
  NEGOTIATION: "Discussing price / terms",
  CLOSED_WON: "Deal won",
  DISQUALIFIED: "Not a fit — removed from pipeline",
  DEAL_LOST: "Lost to competition or no decision",
};

export function nextProcessStage(stage: LeadStage): LeadStage | null {
  const idx = PROCESS_STAGES.indexOf(stage);
  if (idx < 0 || idx >= PROCESS_STAGES.length - 1) return null;
  return PROCESS_STAGES[idx + 1];
}

export function processStepIndex(stage: LeadStage): number {
  const idx = PROCESS_STAGES.indexOf(stage);
  if (idx >= 0) return idx;
  // Exits sit after the active path for progress display
  if (stage === "DISQUALIFIED" || stage === "DEAL_LOST") return -1;
  return 0;
}

export const LEAD_PRIORITIES: LeadPriority[] = ["HOT", "HIGH", "MEDIUM", "LOW"];

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  HOT: "Hot",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const LEAD_CHANNEL_LABELS: Record<RfqChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  WEB_FORM: "Website",
  MARKETPLACE: "Marketplace",
  MANUAL: "Manual",
  REFERRAL: "Referral",
  IMPORT: "Import",
  API: "API",
  OTHER: "Other",
};

/** Primary intake channels that must always appear under All leads. */
export const PRIMARY_LEAD_CHANNELS: RfqChannel[] = ["EMAIL", "WHATSAPP"];

/** Default SLA hours from lead creation / stage change */
export const DEFAULT_SLA_HOURS = 24;

export const DATE_PRESETS = [
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "last4months",
  "thisMonth",
  "previousMonth",
  "custom",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const DEFAULT_LEAD_COLUMNS = [
  "leadId",
  "leadContact",
  "requirement",
  "stage",
  "priority",
  "quoteDetails",
  "assignedTo",
  "expected",
  "nextFollowUp",
  "sla",
  "actions",
] as const;

export type LeadColumnId = (typeof DEFAULT_LEAD_COLUMNS)[number];

/** Map older saved column prefs onto the compact column set. */
export function normalizeLeadColumns(raw: unknown): LeadColumnId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_LEAD_COLUMNS];
  const mapped: LeadColumnId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let next = item;
    if (
      item === "leadName" ||
      item === "contactPerson" ||
      item === "phone" ||
      item === "email"
    ) {
      next = "leadContact";
    } else if (item === "leadNumber" || item === "source") {
      next = "leadId";
    } else if (item === "category") {
      next = "requirement";
    } else if (item === "expectedValue" || item === "expectedClosure") {
      next = "expected";
    } else if (item === "lastActivity") {
      continue;
    }
    if (!(DEFAULT_LEAD_COLUMNS as readonly string[]).includes(next)) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    mapped.push(next as LeadColumnId);
  }
  return mapped.length ? mapped : [...DEFAULT_LEAD_COLUMNS];
}
