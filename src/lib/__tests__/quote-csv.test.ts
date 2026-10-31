import { describe, expect, it } from "vitest";
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
