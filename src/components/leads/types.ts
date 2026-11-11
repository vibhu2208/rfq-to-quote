export type LeadUser = { id: string; name: string; email: string };

export type LeadRow = {
  id: string;
  leadNumber: string;
  channel: string;
  subject: string;
  rawText: string;
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
  category: string;
  parsedCategory: string | null;
  leadStage: string;
  priority: string;
  intakeKind: "REQUIREMENT" | "JUNK" | "SKIPPED";
  junkReason: string;
  stageDetail: string;
  expectedValue: string | number | null;
  expectedClosureAt: string | null;
  nextFollowUpAt: string | null;
  slaDueAt: string | null;
  slaBreachedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: LeadUser | null;
  quotes: {
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: string | number;
    version: number;
    createdAt: string;
    sentAt?: string | null;
  }[];
  activities: {
    id: string;
    type: string;
    title: string;
    body?: string;
    createdAt: string;
  }[];
  _count: {
    quotes: number;
    messages: number;
    followUps: number;
    attachments: number;
  };
};
