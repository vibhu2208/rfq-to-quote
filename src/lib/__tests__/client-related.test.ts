import { describe, expect, it } from "vitest";
import {
  CLIENT_BOOKS_BALANCE_NOTE,
  clientMatchNames,
  leadMatchesClient,
  quoteMatchesClient,
} from "@/lib/client-related";

const client = {
  id: "party_3a",
  legalName: "3A Exports",
  tradeName: "3A",
  gstin: "27AAAAA0000A1Z5",
  email: "accounts@3aexports.example",
};

describe("client related work matching", () => {
  it("does not use a very short trade name as a company match", () => {
    expect(clientMatchNames(client)).toEqual(["3A Exports"]);
  });

  it("matches quotes and leads for that client and ignores other companies", () => {
    expect(
      quoteMatchesClient(
        {
          buyerCompany: "3a exports",
          buyerGstin: "",
          buyerEmail: "",
          rfqPartyId: null,
        },
        client
      )
    ).toBe(true);
    expect(
      quoteMatchesClient(
        {
          buyerCompany: "Other Traders",
          buyerGstin: "",
          buyerEmail: "",
          rfqPartyId: null,
        },
        client
      )
    ).toBe(false);
    expect(
      quoteMatchesClient(
        {
          buyerCompany: "",
          buyerGstin: "27aaaaa0000a1z5",
          buyerEmail: "",
          rfqPartyId: null,
        },
        client
      )
    ).toBe(true);
    expect(
      leadMatchesClient(
        { partyId: "party_3a", customerCompany: "", customerEmail: "" },
        client
      )
    ).toBe(true);
    expect(
      leadMatchesClient(
        {
          partyId: null,
          customerCompany: "3A Exports",
          customerEmail: "",
        },
        client
      )
    ).toBe(true);
    expect(
      leadMatchesClient(
        { partyId: "other", customerCompany: "Different Co", customerEmail: "" },
        client
      )
    ).toBe(false);
  });

  it("describes quote-based activity instead of Books ledger history", () => {
    expect(CLIENT_BOOKS_BALANCE_NOTE).toMatch(/quote/i);
    expect(CLIENT_BOOKS_BALANCE_NOTE).toMatch(/opening balance/i);
  });
});
