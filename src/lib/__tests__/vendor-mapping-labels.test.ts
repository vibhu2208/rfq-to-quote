import { describe, expect, it } from "vitest";
import {
  PRIMARY_POC_TITLE,
  assignMappingHelp,
  assignMappingSaveLabel,
  taxonomySourceLabel,
} from "@/lib/vendor-mapping-labels";

describe("assign mapping save label", () => {
  it("does not call an empty save 'unlink all'", () => {
    expect(
      assignMappingSaveLabel({
        selectedSubcategories: 0,
        categoryLevelSelected: false,
        unlinking: 2,
      })
    ).toBe("Remove 2 mappings");
    expect(
      assignMappingSaveLabel({
        selectedSubcategories: 1,
        categoryLevelSelected: false,
        unlinking: 0,
      })
    ).toBe("Save mapping");
    expect(
      assignMappingHelp({
        selectedSubcategories: 0,
        categoryLevelSelected: false,
        unlinking: 0,
        categoryHasNamedSubs: false,
      })
    ).toMatch(/category level/i);
  });

  it("explains that Primary is a contact, not a preferred vendor", () => {
    expect(PRIMARY_POC_TITLE.toLowerCase()).toContain("point of contact");
    expect(PRIMARY_POC_TITLE.toLowerCase()).toContain("not a preferred vendor");
    expect(taxonomySourceLabel("admin").title.toLowerCase()).toContain(
      "vendor mapping"
    );
    expect(taxonomySourceLabel("catalog").label).toBe("Catalog");
  });
});
