import { describe, expect, it } from "vitest";
import { slaLabel } from "@/components/leads/leads-workbench-helpers";
import type { LeadRow } from "@/components/leads/types";

function row(partial: Partial<LeadRow>): LeadRow {
  return {
    id: "1",
    leadNumber: "L-1",
    channel: "EMAIL",
    subject: "",
    rawText: "",
    customerName: "",
    customerCompany: "",
    customerEmail: "",
    customerPhone: "",
    category: "",
    parsedCategory: null,
    leadStage: "NEW_LEAD",
    priority: "MEDIUM",
    intakeKind: "REQUIREMENT",
    junkReason: "",
    stageDetail: "",
    expectedValue: null,
    expectedClosureAt: null,
    nextFollowUpAt: null,
    slaDueAt: null,
    slaBreachedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedTo: null,
    quotes: [],
    activities: [],
    _count: { quotes: 0, messages: 0, followUps: 0, attachments: 0 },
    ...partial,
  };
}

describe("slaLabel", () => {
  it("returns dash when no SLA due date", () => {
    expect(slaLabel(row({ slaDueAt: null }))).toBe("—");
  });

  it("shows On track when deadline is in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      slaLabel(
        row({
          slaDueAt: future,
          slaBreachedAt: new Date().toISOString(),
        })
      )
    ).toBe("On track");
  });

  it("shows Overdue only after the deadline passes", () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    expect(slaLabel(row({ slaDueAt: past }))).toBe("Overdue");
  });
});