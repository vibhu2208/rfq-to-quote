import { describe, expect, it } from "vitest";
import { CLIENT_GROUPS } from "@/lib/master-data";
import {
  applyGstinPreview,
  CLIENT_FLAGS,
  emptyOnboardValues,
  formToMasterData,
  formToPartyPayload,
  normalizeOnboardContacts,
  uniqueClientMasterKeys,
} from "@/lib/client-onboard";

describe("client onboard form", () => {
  it("covers every client information section key once", () => {
    const keys = uniqueClientMasterKeys();
    const listed = CLIENT_GROUPS.flatMap((g) => g.keys);
    expect(keys.length).toBe(new Set(listed).size);
    expect(keys).toContain("ClientName");
    expect(keys).toContain("GSTIN");
    expect(keys).toContain("BankName");
    expect(keys).toContain("IsVendor");
  });

  it("maps GSTIN fetch and form fields onto the party payload used by client details", () => {
    const filled = applyGstinPreview(emptyOnboardValues(), {
      gstin: "27AABCU9603R1ZX",
      legalName: "Acme Private Limited",
      tradeName: "Acme",
      status: "Active",
      stateName: "Maharashtra",
      stateCode: "27",
      addressLine1: "12 MG Road",
      city: "Pune",
      postalCode: "411001",
    });
    filled.fields.ClientPAN = "AABCU9603R";
    filled.fields.ClientPhone1 = "9876543210";
    filled.fields.ClientEmail = "ops@acme.test";
    filled.fields.IsVendor = "Yes";
    filled.contacts = [
      { name: "Riya", designation: "Purchase", email: "riya@acme.test", phone: "9000000001", isPrimary: true },
      { name: "Amit", designation: "Accounts", email: "amit@acme.test", phone: "9000000002", isPrimary: false },
    ];

    const party = formToPartyPayload(filled);
    expect(party.legalName).toBe("Acme Private Limited");
    expect(party.tradeName).toBe("Acme");
    expect(party.gstin).toBe("27AABCU9603R1ZX");
    expect(party.pan).toBe("AABCU9603R");
    expect(party.phone).toBe("9876543210");
    expect(party.email).toBe("ops@acme.test");
    expect(party.isVendor).toBe(true);
    expect(party.address?.city).toBe("Pune");
    expect(party.address?.stateCode).toBe("27");
    expect(party.managedByName).toBe("Riya");
    expect(party.contacts).toHaveLength(2);
    expect(party.contacts[0]).toMatchObject({ name: "Riya", isPrimary: true });
    expect(formToMasterData(filled).ClientName).toBe("Acme Private Limited");
    expect(formToMasterData(filled).GSTIN).toBe("27AABCU9603R1ZX");
  });

  it("keeps one primary contact and explains ledger flags", () => {
    const rows = normalizeOnboardContacts([
      { name: "A", designation: "", email: "", phone: "", isPrimary: false },
      { name: "B", designation: "", email: "b@x.test", phone: "", isPrimary: true },
      { name: "", designation: "", email: "", phone: "", isPrimary: false },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(rows[1].isPrimary).toBe(true);
    expect(CLIENT_FLAGS.find((f) => f.key === "IsVendor")?.label).toBe("Also a vendor");
  });
});
