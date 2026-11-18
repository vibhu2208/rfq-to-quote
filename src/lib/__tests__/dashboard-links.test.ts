import { describe, expect, it } from "vitest";
import { dashboardDrilldowns } from "@/lib/dashboard-links";
import { buildLeadWhere } from "@/lib/leads/filters";
import { authErrorMessage } from "@/lib/auth-error";

describe("dashboardDrilldowns", () => {
  const links = dashboardDrilldowns(new Date("2026-11-18T12:00:00"));

  it("opens unprocessed RFQs, assistance, pipeline, and won-this-month", () => {
    expect(links.openRfqs).toBe("/leads?openRfq=1");
    expect(links.needAssistance).toBe("/quotes?assist=1");
    const pipeline = new URLSearchParams(links.pipeline.split("?")[1]);
    expect(pipeline.get("status")?.split(",")).toEqual([
      "SENT",
      "VIEWED",
      "UNDER_NEGOTIATION",
      "REVISED",
    ]);
    const won = new URLSearchParams(links.wonThisMonth.split("?")[1]);
    expect(won.get("updatedFrom")).toBe("2026-11-01");
    expect(won.get("status")).toContain("ACCEPTED");
  });

  it("opens lead cards on the same population the dashboard counts", () => {
    expect(links.newLeads).toBe("/leads?intakeKind=REQUIREMENT&stage=NEW_LEAD");
    expect(links.totalLeads).toBe("/leads?intakeKind=REQUIREMENT");
    expect(links.hotLeads).toBe("/leads/hot");
    expect(links.wonLeads).toBe("/leads/won");
  });
});

describe("open RFQ filter", () => {
  it("limits the list to new, needs review, and parsed RFQs", () => {
    expect(buildLeadWhere({ openRfq: true })).toEqual({
      AND: [
        { archivedAt: null },
        { status: { in: ["NEW", "NEEDS_REVIEW", "PARSED"] } },
      ],
    });
  });
});

describe("authErrorMessage", () => {
  it("explains a cold-start configuration error and unknown codes", () => {
    expect(authErrorMessage("Configuration")).toMatch(/idle/i);
    expect(authErrorMessage("")).toMatch(/try again/i);
    expect(authErrorMessage("SomethingNew")).toMatch(/try again/i);
  });
});
