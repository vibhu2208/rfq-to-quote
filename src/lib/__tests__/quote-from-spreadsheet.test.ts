import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseQuoteSpreadsheet } from "@/lib/quote-csv";
import { quoteLinesFromSpreadsheetItems } from "@/lib/quote-from-spreadsheet";

function xlsxBuffer(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Items");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("quoteLinesFromSpreadsheetItems", () => {
  it("puts spreadsheet name, description, unit, and price on the quote line", () => {
    const parsed = parseQuoteSpreadsheet(
      Buffer.from(
        `Item Name,Description,Qty,Unit,Rate,GST %,HSN
ZXQ Core Switch,48-port SFP+ HQ,2,No's,12500,18,851762`
      ),
      "quote.csv"
    );
    const lines = quoteLinesFromSpreadsheetItems(parsed.items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: null,
      aliasName: "ZXQ Core Switch",
      qty: 2,
      unit: "nos",
      unitPrice: 12500,
      taxRate: 18,
    });
    expect(lines[0].description).toContain("48-port SFP+ HQ");
    expect(lines[0].description).toContain("851762");
  });

  it("does not treat EST. UNIT PRICE as the UOM, and keeps that value as the ex-GST rate", () => {
    const parsed = parseQuoteSpreadsheet(
      xlsxBuffer([
        [
          "MAKE",
          "PRODUCT CODE / MODEL",
          "PRODUCT / DESCRIPTION",
          "QTY",
          "EST. UNIT PRICE (INR, EX GST)",
          "EST. AMOUNT (EX GST)",
          "GST 18%",
          "EST. TOTAL (INCL. GST)",
        ],
        ["Netgear", "XSM4328FV", "24 Port SFP Core Switch", 2, 325000, 650000, 117000, 767000],
      ]),
      "budget.xlsx"
    );
    const lines = quoteLinesFromSpreadsheetItems(parsed.items);
    expect(lines[0]).toMatchObject({
      aliasName: "24 Port SFP Core Switch",
      qty: 2,
      unit: "nos",
      unitPrice: 325000,
      taxRate: 18,
    });
    expect(lines[0].unit).not.toBe("325000");
    expect(lines[0].unitPrice).not.toBe(767000);
    expect(lines[0].unitPrice).not.toBe(650000);
  });

  it("links a catalog product by SKU but keeps the spreadsheet price", () => {
    const parsed = parseQuoteSpreadsheet(
      Buffer.from(`Item,SKU,Qty,Rate\nOffice laptop,LAP-9,3,41000`),
      "quote.csv"
    );
    const lines = quoteLinesFromSpreadsheetItems(parsed.items, [
      { id: "prod-1", code: "LAP-9", taxRate: 12, hsnCode: "8471" },
    ]);
    expect(lines[0]).toMatchObject({
      productId: "prod-1",
      aliasName: "Office laptop",
      qty: 3,
      unitPrice: 41000,
      taxRate: 12,
    });
  });
});
