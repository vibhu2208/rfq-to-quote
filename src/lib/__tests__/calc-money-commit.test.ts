import { describe, expect, it } from "vitest";
import {
  formatMoneyCommitRangeError,
  resolveMoneyCommit,
} from "@/lib/calc-money-commit";

describe("resolveMoneyCommit", () => {
  it("rejects negative sell prices instead of coercing to 0", () => {
    expect(
      resolveMoneyCommit(-50, { min: 0, prior: 4500 })
    ).toEqual({ ok: false, reason: "below_min" });
  });

  it("accepts an explicit zero (intentional free item)", () => {
    expect(resolveMoneyCommit(0, { min: 0, prior: 4500 })).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("accepts a normal positive price", () => {
    expect(resolveMoneyCommit(4500, { min: 0, prior: 1200 })).toEqual({
      ok: true,
      value: 4500,
    });
  });

  it("rejects values above max instead of clamping them", () => {
    expect(
      resolveMoneyCommit(99_999_999_999, {
        min: 0,
        max: 9_999_999_999.99,
        prior: 4500,
      })
    ).toEqual({ ok: false, reason: "above_max" });
  });

  it("rejects non-finite input", () => {
    expect(
      resolveMoneyCommit(Number.NaN, { min: 0, prior: 4500 })
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("formatMoneyCommitRangeError", () => {
  it("explains negative prices clearly", () => {
    expect(formatMoneyCommitRangeError("below_min", { min: 0 })).toBe(
      "Price cannot be negative"
    );
  });

  it("explains the maximum without saving a clamped price", () => {
    expect(
      formatMoneyCommitRangeError("above_max", {
        min: 0,
        max: 9_999_999_999.99,
      })
    ).toContain("9,99,99,99,999.99");
  });
});
