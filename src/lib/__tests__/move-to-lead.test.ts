import { describe, expect, it } from "vitest";
import { buildLeadRequirementFromContact } from "@/lib/telemarketing/move-to-lead";

describe("buildLeadRequirementFromContact", () => {
  it("includes company, role, and contact channels", () => {
    const text = buildLeadRequirementFromContact({
      name: "Ada",
      company: "Acme Corp",
      role: "Buyer",
      phone: "919876543210",
      email: "ada@acme.test",
    });
    expect(text).toContain("Telemarketing");
    expect(text).toContain("Acme Corp");
    expect(text).toContain("Buyer");
    expect(text).toContain("919876543210");
    expect(text).toContain("ada@acme.test");
  });

  it("omits empty fields", () => {
    const text = buildLeadRequirementFromContact({
      name: "Bob",
      company: "",
      role: "",
      phone: "9000000000",
      email: "",
    });
    expect(text).not.toContain("Company:");
    expect(text).toContain("9000000000");
  });
});