import { describe, expect, it } from "vitest";
import { rfqRequirementsMissingFromProductPanel } from "@/lib/rfq-workspace";

describe("rfqRequirementsMissingFromProductPanel", () => {
  it("flags RFQ lines absent from the products panel", () => {
    const missing = rfqRequirementsMissingFromProductPanel(
      [
        { lineNumber: 1 },
        { lineNumber: 2 },
        { lineNumber: 3 },
      ],
      [{ lineNumber: 1 }, { lineNumber: 2 }]
    );
    expect(missing).toEqual([3]);
  });
});