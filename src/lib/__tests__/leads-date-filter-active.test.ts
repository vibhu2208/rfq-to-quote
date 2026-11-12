import { describe, expect, it } from "vitest";
import { isDatePresetFilterActive } from "@/components/leads/leads-workbench-helpers";

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
