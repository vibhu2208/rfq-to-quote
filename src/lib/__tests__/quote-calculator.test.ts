import { describe, expect, it } from "vitest";
import {
  applyGst,
  calculatorShortcutLabel,
  evaluateExpression,
  evaluateMoneyFieldExpression,
  formatCalcNumber,
  isCalculatorToggle,
  looksLikeMoneyExpression,
  removeGst,
} from "@/lib/quote-calculator";

describe("evaluateExpression", () => {
  it("adds, multiplies, and respects parentheses", () => {
    expect(evaluateExpression("2+3")).toEqual({ ok: true, value: 5 });
    expect(evaluateExpression("450 * 12")).toEqual({ ok: true, value: 5400 });
    expect(evaluateExpression("100*1.18")).toEqual({ ok: true, value: 118 });
    expect(evaluateExpression("(10+2)*3")).toEqual({ ok: true, value: 36 });
  });

  it("handles unary minus, percent, and Indian commas", () => {
    expect(evaluateExpression("-3+5")).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression("10%")).toEqual({ ok: true, value: 0.1 });
    expect(evaluateExpression("200*10%")).toEqual({ ok: true, value: 20 });
    expect(evaluateExpression("1,00,000*1.18")).toEqual({ ok: true, value: 118000 });
    expect(evaluateExpression(".5*4")).toEqual({ ok: true, value: 2 });
  });

  it("treats +% / -% as percent of the left amount (GST-style)", () => {
    expect(evaluateExpression("400+18%")).toEqual({ ok: true, value: 472 });
    expect(evaluateExpression("400-18%")).toEqual({ ok: true, value: 328 });
    expect(evaluateMoneyFieldExpression("4+4=")).toEqual({ ok: true, value: 8 });
    expect(looksLikeMoneyExpression("400+18%")).toBe(true);
    expect(looksLikeMoneyExpression("472")).toBe(false);
  });

  it("rejects empty, divide-by-zero, and junk input", () => {
    expect(evaluateExpression("")).toEqual({ ok: false, error: "Enter a calculation" });
    expect(evaluateExpression("   ")).toEqual({ ok: false, error: "Enter a calculation" });
    expect(evaluateExpression("1/0")).toEqual({ ok: false, error: "Cannot divide by zero" });
    expect(evaluateExpression("2**2")).toEqual({ ok: false, error: "Invalid calculation" });
    expect(evaluateExpression("abc")).toEqual({ ok: false, error: "Invalid calculation" });
  });
});

describe("GST helpers", () => {
  it("adds and strips 18% GST", () => {
    expect(applyGst(100).ok && applyGst(100).ok ? applyGst(100) : null).toEqual({
      ok: true,
      value: 118,
    });
    const stripped = removeGst(118);
    expect(stripped.ok).toBe(true);
    if (stripped.ok) expect(stripped.value).toBeCloseTo(100);
  });
});

describe("formatCalcNumber", () => {
  it("trims trailing zeros", () => {
    expect(formatCalcNumber(118)).toBe("118");
    expect(formatCalcNumber(12.5)).toBe("12.5");
    expect(formatCalcNumber(-0)).toBe("0");
  });
});

describe("shortcut", () => {
  it("matches Alt+C, and Ctrl/Cmd+Alt+C when a modifier is required", () => {
    expect(
      isCalculatorToggle({ key: "c", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false })
    ).toBe(true);
    expect(
      isCalculatorToggle(
        { key: "C", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false },
        { requireMod: true }
      )
    ).toBe(true);
    expect(
      isCalculatorToggle(
        { key: "c", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false },
        { requireMod: true }
      )
    ).toBe(false);
    expect(
      isCalculatorToggle({ key: "c", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })
    ).toBe(false);
    expect(calculatorShortcutLabel("Win32")).toBe("Alt+C");
    expect(calculatorShortcutLabel("MacIntel")).toBe("⌃⌥C");
  });
});
