import { describe, expect, it } from "vitest";
import {
  preserveProductSelectionsOnReparse,
  retainLeadParsedCategory,
} from "@/lib/rfq-reparse";

describe("retainLeadParsedCategory", () => {
  it("KAN-140: keeps Misc (or any stored category) on re-parse", () => {
    expect(retainLeadParsedCategory("Misc", "CABLE")).toBe("Misc");
    expect(retainLeadParsedCategory("", "CABLE")).toBe("CABLE");
    expect(retainLeadParsedCategory(null, "CABLE")).toBe("CABLE");
  });
});

describe("preserveProductSelectionsOnReparse", () => {
  it("moves catalog picks to the matching re-parsed line by description", () => {
    const preserved = preserveProductSelectionsOnReparse(
      {
        lineSelection: { "2": "prod-patch", "3": "prod-panel" },
        lineVendorSelection: { "2": "vendor-a" },
      },
      [
        { description: "16-port switch", quantity: 3 },
        { description: "CAT6 patch cord 1 m", quantity: 50 },
        { description: "24-port patch panel", quantity: 2 },
      ],
      [
        { description: "16-port unmanaged switch", quantity: 3 },
        { description: "CAT6 patch cord 1 m", quantity: 50 },
        { description: "24-port CAT6 patch panel (D-Link)", quantity: 2 },
        { description: "27-inch QHD monitor", quantity: 4 },
      ]
    );
    expect(preserved?.lineSelection).toEqual({ "2": "prod-patch" });
    expect(preserved?.lineVendorSelection).toEqual({ "2": "vendor-a" });
  });
});