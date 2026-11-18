import { describe, expect, it } from "vitest";
import {
  buildLeadsWorkbenchSearchParams,
  decideLeadsUrlSync,
  defaultWorkbenchIntakeKind,
  parseLeadsWorkbenchSearchParams,
} from "@/lib/leads/query";

describe("leads workbench URL state", () => {
  it("defaults intake to all, or REQUIREMENT on pipeline presets", () => {
    expect(defaultWorkbenchIntakeKind()).toBe("all");
    expect(defaultWorkbenchIntakeKind({ mine: "1" })).toBe("REQUIREMENT");
    expect(defaultWorkbenchIntakeKind({ hotOnly: "1" })).toBe("REQUIREMENT");
  });

  it("round-trips Needs review + drawer lead through search params", () => {
    const params = buildLeadsWorkbenchSearchParams({
      intakeKind: "review",
      q: "cameras",
      stage: "",
      priority: "HOT",
      channel: "",
      assignee: "",
      category: "",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      slaStatus: "",
      page: 2,
      leadId: "lead_123",
    });

    expect(params.get("intakeKind")).toBe("review");
    expect(params.get("q")).toBe("cameras");
    expect(params.get("priority")).toBe("HOT");
    expect(params.get("page")).toBe("2");
    expect(params.get("leadId")).toBe("lead_123");

    const parsed = parseLeadsWorkbenchSearchParams(params);
    expect(parsed).toMatchObject({
      intakeKind: "review",
      q: "cameras",
      priority: "HOT",
      page: 2,
      leadId: "lead_123",
    });
  });

  it("omits default intakeKind from the URL", () => {
    const params = buildLeadsWorkbenchSearchParams({
      intakeKind: "all",
      q: "",
      stage: "",
      priority: "",
      channel: "",
      assignee: "",
      category: "",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      slaStatus: "",
      page: 0,
      leadId: null,
    });
    expect(params.toString()).toBe("");
  });

  it("keeps the open-RFQ drill-down in the URL", () => {
    const params = buildLeadsWorkbenchSearchParams({
      intakeKind: "all",
      q: "",
      stage: "",
      priority: "",
      channel: "",
      assignee: "",
      category: "",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      slaStatus: "",
      page: 0,
      leadId: null,
      openRfq: true,
    });
    expect(params.get("openRfq")).toBe("1");
    expect(parseLeadsWorkbenchSearchParams(params).openRfq).toBe(true);
  });
});

describe("decideLeadsUrlSync", () => {
  it("writes the full query instead of adopting a stale shorter URL", () => {
    const decision = decideLeadsUrlSync({
      currentSearch: "q=L-2026-0001",
      desiredSearch: "q=L-2026-00018",
      lastWrittenSearch: "q=L-2026-00018",
      pendingSearch: "q=L-2026-00018",
    });
    expect(decision.type).toBe("write");
  });

  it("treats a URL change that the state did not make as back/forward", () => {
    const decision = decideLeadsUrlSync({
      currentSearch: "q=cameras",
      desiredSearch: "q=L-2026-00018",
      lastWrittenSearch: "q=L-2026-00018",
      pendingSearch: null,
    });
    expect(decision.type).toBe("apply-external");
  });

  it("idles once the address bar matches the desired query", () => {
    const decision = decideLeadsUrlSync({
      currentSearch: "q=L-2026-00018",
      desiredSearch: "q=L-2026-00018",
      lastWrittenSearch: "q=L-2026-0001",
      pendingSearch: "q=L-2026-00018",
    });
    expect(decision.type).toBe("idle");
  });
});
