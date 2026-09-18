import { describe, expect, it } from "vitest";
import { hasValidGstinChecksum, isValidGstinFormat } from "@/lib/accounting/gsp";

describe("GSTIN helpers", () => {
  it("accepts structured GSTIN format used in seed/sandbox", () => {
    expect(isValidGstinFormat("29AAAAA0000A1Z5")).toBe(true);
    expect(isValidGstinFormat("22AAAAA0000A1Z5")).toBe(true);
  });

  it("rejects wrong length / pattern", () => {
    expect(isValidGstinFormat("29AAAAA0000A1Z")).toBe(false);
    expect(isValidGstinFormat("2XAAAAA0000A1Z5")).toBe(false);
  });

  it("exposes checksum separately for production-grade GSTINs", () => {
    // Seed dummy GSTINs are format-valid but not checksum-valid
    expect(hasValidGstinChecksum("29AAAAA0000A1Z5")).toBe(false);
  });
});
