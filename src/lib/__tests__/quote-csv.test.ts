import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseQuoteSpreadsheet } from "@/lib/quote-csv";
import { matchProductsToRfqItems } from "@/lib/product-match";
import type { Product } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

function fakeProduct(partial: Partial<Product> & Pick<Product, "id" | "code" | "name">): Product {
  return {
    description: "",
    unit: "pcs",
    uqc: "NOS",
    hsnCode: null,
    productType: "GOODS",
    sourceProductId: null,
    modelNo: null,
    partNo: null,
    commCode: null,
    category: null,
    subCategory: null,
    brand: null,
    batchNo: null,
    popularCode: null,
    photoPath: null,
    gstTaxName: null,
    mrp: null,
    lastPrice: null,
    lastPricedAt: null,
    openingStock: new Decimal(0),
    isStockable: true,
    sourceGender: null,
    masterData: {},
    basePrice: new Decimal(100),
    offerPrice: new Decimal(100),
    taxRate: new Decimal(18),
    taxCategory: "GST18",
    active: true,
    organisationId: "org1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("parseQuoteSpreadsheet", () => {
  it("reads product name, sku, and qty from a headed CSV", () => {
    const csv = `Product Name,SKU,Qty,Unit
Dell Latitude 5420,LAP-9,5,pcs
Cat6 Cable 305m,CAB-1,10,box`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "rfq.csv");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      productName: "Dell Latitude 5420",
      code: "LAP-9",
      quantity: 5,
      unit: "pcs",
    });
    expect(parsed.items[1]).toMatchObject({
      productName: "Cat6 Cable 305m",
      code: "CAB-1",
      quantity: 10,
      unit: "box",
    });
  });

  it("keeps the item name as the client wrote it and does not merge brand into the name", () => {
    const csv = `Item,Brand,SKU,Qty,Unit
Office laptop,Dell,LAP-9,5,No's`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "rfq.csv");
    expect(parsed.items[0]).toMatchObject({
      productName: "Office laptop",
      brand: "Dell",
      code: "LAP-9",
      quantity: 5,
      unit: "No's",
    });
  });

  it("puts extra description in notes and keeps the spreadsheet unit", () => {
    const csv = `Item Name,Description,Brand,Qty,Unit
Cat6 cable,305 meter carton,D-Link,10,box`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "rfq.csv");
    expect(parsed.items[0]).toMatchObject({
      productName: "Cat6 cable",
      extraNotes: "305 meter carton",
      brand: "D-Link",
      quantity: 10,
      unit: "box",
    });
  });

  it("understands particulars/quantity headers and skips empty rows", () => {
    const csv = `\uFEFFParticulars,Quantity
CCTV Camera 2MP,8

,`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "need.csv");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      productName: "CCTV Camera 2MP",
      quantity: 8,
    });
  });

  it("falls back to first columns when headers are missing", () => {
    const csv = `UPS 1KVA Online,2,pcs,UPS-1KVA
Network Switch 24 port,4`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "list.csv");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      productName: "UPS 1KVA Online",
      quantity: 2,
      unit: "pcs",
      code: "UPS-1KVA",
    });
    expect(parsed.items[1].quantity).toBe(4);
  });

  it("reads unit price, description, tax, HSN, and company for a full quote spreadsheet", () => {
    const csv = `Client,Item Name,Description,SKU,Qty,Unit,Rate,GST %,HSN
Acme Pvt Ltd,ZXQ Core Switch,48-port SFP+ HQ,ZX-91827,2,No's,12500,18,851762`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "quote.csv");
    expect(parsed.company).toBe("Acme Pvt Ltd");
    expect(parsed.items[0]).toMatchObject({
      productName: "ZXQ Core Switch",
      extraNotes: "48-port SFP+ HQ",
      code: "ZX-91827",
      quantity: 2,
      unit: "No's",
      unitPrice: 12500,
      taxRate: 18,
      hsnCode: "851762",
    });
  });

  it("reads estimated unit price, amount, GST rate, and product code from a budgetary quote workbook", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Description", "Amount (INR)"],
        ["Estimated subtotal (ex GST)", 4111961],
      ]),
      "Summary"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          "SL.NO",
          "MAKE",
          "PRODUCT CODE / MODEL",
          "PRODUCT / DESCRIPTION",
          "QTY",
          "EST. UNIT PRICE (INR, EX GST)",
          "EST. AMOUNT (EX GST)",
          "GST 18%",
          "EST. TOTAL (INCL. GST)",
        ],
        [1, "Netgear", "XSM4328FV + APS250W", "24 Port SFP Core Switch", 2, 325000, 650000, 117000, 767000],
        [2, "Netgear", "GS752TX", "48 Port Data Switch", 3, 85000, 255000, 45900, 300900],
      ]),
      "Estimated Prices"
    );
    const parsed = parseQuoteSpreadsheet(
      Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
      "network_line_items_budgetary_prices.xlsx"
    );
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      productName: "24 Port SFP Core Switch",
      brand: "Netgear",
      code: "XSM4328FV + APS250W",
      quantity: 2,
      unit: "",
      unitPrice: 325000,
      taxRate: 18,
    });
    expect(parsed.items[0].unit).not.toBe("325000");
    expect(parsed.items[1]).toMatchObject({
      productName: "48 Port Data Switch",
      quantity: 3,
      unitPrice: 85000,
      taxRate: 18,
    });
  });

  it("derives unit price from line amount when rate is missing", () => {
    const csv = `Particulars,Qty,Amount
Cat6 UTP Cable,30,45000`;
    const parsed = parseQuoteSpreadsheet(Buffer.from(csv), "quote.csv");
    expect(parsed.items[0]).toMatchObject({
      productName: "Cat6 UTP Cable",
      quantity: 30,
      unitPrice: 1500,
    });
  });

  it("reads LastPrice and falls back to Cost on ERP-style product sheets", () => {
    const withLast = parseQuoteSpreadsheet(
      Buffer.from(`ProductID,ProductName,UnitName,LastPrice,MRP,Cost
153002,AERO Panel,NOS,42000,45000,38000`),
      "glass-audio.csv"
    );
    expect(withLast.items[0]).toMatchObject({
      productName: "AERO Panel",
      code: "153002",
      unit: "NOS",
      unitPrice: 42000,
    });

    const costOnly = parseQuoteSpreadsheet(
      Buffer.from(`ProductID,ProductName,UnitName,MRP,Cost
147446,100AH Battery,NOS,0,7168`),
      "glass-audio.csv"
    );
    expect(costOnly.items[0]).toMatchObject({
      productName: "100AH Battery",
      unitPrice: 7168,
    });
  });

  it("prefers MRP over Cost when LastPrice is missing", () => {
    const parsed = parseQuoteSpreadsheet(
      Buffer.from(`ProductName,MRP,Cost
Scanner,3500,1825`),
      "products.csv"
    );
    expect(parsed.items[0].unitPrice).toBe(3500);
  });

  it("reads Unit Prce + Discription typos from audio RFQ workbooks", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["S.no.", "Discription", "Make /Model", "Qty", "Unit Prce", "Total"],
        [1, "Ceiling Speaker 10 Watt", "JBL 8128", 20, 8500, 170000],
        ["", "Ceiling Speaker 20 Watt", "Control 412C/T 20W", 1, "", ""],
        [2, "Amplifier", "Ahuja SSB-120DP", 4, 24500, 98000],
        ["", "", "", "", "Total ", 268000],
      ]),
      "Sheet1"
    );
    const parsed = parseQuoteSpreadsheet(
      Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
      "gla_audio.xlsx"
    );
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      productName: "Ceiling Speaker 10 Watt",
      code: "JBL 8128",
      quantity: 20,
      unitPrice: 8500,
    });
    expect(parsed.items[1]).toMatchObject({
      productName: "Ceiling Speaker 20 Watt",
      quantity: 1,
      unitPrice: 0,
    });
    expect(parsed.items[2]).toMatchObject({
      productName: "Amplifier",
      code: "Ahuja SSB-120DP",
      unitPrice: 24500,
    });
  });
});

describe("csv catalog matching", () => {
  it("matches CSV SKU to the catalog product code even if the name differs", () => {
    const products = [
      fakeProduct({ id: "1", code: "LAP-9", name: "Dell Latitude 5420", description: "laptop" }),
      fakeProduct({ id: "2", code: "CAB-1", name: "Cat6 Cable 305m", description: "cable" }),
    ];
    const csv = parseQuoteSpreadsheet(
      Buffer.from(`Item,Item Code,Qty\nOffice laptop,LAP-9,3`),
      "rfq.csv"
    );
    const matches = matchProductsToRfqItems(products, {
      parsedSpecs: {
        items: csv.items.map((item) => ({
          description: item.productName,
          productName: item.productName,
          code: item.code,
          quantity: item.quantity,
          unit: item.unit,
        })),
      },
    });
    expect(matches[0].matches[0]?.product.code).toBe("LAP-9");
    expect(matches[0].requirement.description).toBe("Office laptop");
    expect(matches[0].requirement.quantity).toBe(3);
  });
});
