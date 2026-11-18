import { describe, expect, it } from "vitest";
import {
  continueQuoteTarget,
  customDateRangeError,
  isDatePresetFilterActive,
  savedViewFiltersMatch,
  visibleLeadColumns,
} from "@/components/leads/leads-workbench-helpers";

describe("isDatePresetFilterActive", () => {
  it("ignores blank custom range until a date is applied", () => {
    expect(isDatePresetFilterActive("custom", "", "")).toBe(false);
    expect(isDatePresetFilterActive("custom", "  ", "")).toBe(false);
  });

  it("treats custom as active once either bound is set", () => {
    expect(isDatePresetFilterActive("custom", "2026-11-01", "")).toBe(true);
    expect(isDatePresetFilterActive("custom", "", "2026-11-12")).toBe(true);
  });

  it("treats named presets as active and all as inactive", () => {
    expect(isDatePresetFilterActive("all")).toBe(false);
    expect(isDatePresetFilterActive("today")).toBe(true);
    expect(isDatePresetFilterActive("last7")).toBe(true);
  });
});

describe("customDateRangeError", () => {
  it("rejects a reversed range and allows a one-sided or ordered range", () => {
    expect(customDateRangeError("2026-11-20", "2026-11-01")).toMatch(/before/i);
    expect(customDateRangeError("2026-11-01", "2026-11-20")).toBeNull();
    expect(customDateRangeError("2026-11-01", "")).toBeNull();
    expect(customDateRangeError("", "")).toBeNull();
  });
});

describe("visibleLeadColumns", () => {
  it("hides Lead / Source and Stage when they are unchecked", () => {
    const cols = visibleLeadColumns([
      "leadContact",
      "requirement",
      "priority",
      "actions",
    ]);
    expect(cols).not.toContain("leadId");
    expect(cols).not.toContain("stage");
    expect(cols[0]).toBe("leadContact");
    expect(cols.at(-1)).toBe("actions");
  });
});

describe("saved views and continue quote", () => {
  it("marks a cleared saved view as no longer matching", () => {
    expect(
      savedViewFiltersMatch(
        { stage: "CONTACTED", datePreset: "last7", priority: "MEDIUM" },
        { stage: "", datePreset: "all", priority: "" }
      )
    ).toBe(false);
    expect(
      savedViewFiltersMatch(
        { stage: "CONTACTED", datePreset: "last7" },
        { stage: "CONTACTED", datePreset: "last7" }
      )
    ).toBe(true);
  });

  it("continues the newest draft instead of creating another quote", () => {
    const target = continueQuoteTarget([
      { id: "sent", status: "SENT" },
      { id: "draft", status: "DRAFT" },
    ]);
    expect(target?.id).toBe("draft");
    expect(continueQuoteTarget([])).toBeNull();
  });
});
