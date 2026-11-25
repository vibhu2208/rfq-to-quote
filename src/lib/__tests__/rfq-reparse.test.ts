import { describe, expect, it } from "vitest";
import { retainLeadParsedCategory } from "@/lib/rfq-reparse";

describe("retainLeadParsedCategory", () => {
  it("KAN-140: keeps Misc (or any stored category) on re-parse", () => {
    expect(retainLeadParsedCategory("Misc", "CABLE")).toBe("Misc");
    expect(retainLeadParsedCategory("", "CABLE")).toBe("CABLE");
    expect(retainLeadParsedCategory(null, "CABLE")).toBe("CABLE");
  });
});