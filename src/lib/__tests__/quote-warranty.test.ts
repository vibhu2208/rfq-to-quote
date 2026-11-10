import { describe, expect, it } from "vitest";
import { formatWarrantyLabel, normalizeWarrantyService } from "@/lib/quote-warranty";

describe("formatWarrantyLabel", () => {
  it("formats years/months/days with service type", () => {
    expect(
      formatWarrantyLabel({ warrantyQty: 3, warrantyUnit: "years", warrantyService: "onsite" })
    ).toBe("3 Years · Onsite");
    expect(
      formatWarrantyLabel({ warrantyQty: 1, warrantyUnit: "month", warrantyService: "offsite" })
    ).toBe("1 Month · Offsite");
    expect(
      formatWarrantyLabel({ warrantyQty: 90, warrantyUnit: "days", warrantyService: "both" })
    ).toBe("90 Days · Onsite + Offsite");
  });

  it("returns empty when qty is missing", () => {
    expect(formatWarrantyLabel({ warrantyQty: 0, warrantyUnit: "years" })).toBe("");
  });
});

describe("normalizeWarrantyService", () => {
  it("accepts both/all as onsite+offsite", () => {
    expect(normalizeWarrantyService("both")).toBe("both");
    expect(normalizeWarrantyService("all")).toBe("both");
  });
});
