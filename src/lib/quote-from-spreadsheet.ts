import type { QuoteCsvItem } from "@/lib/quote-csv";
import { quoteLinePresentation } from "@/lib/quote-line-alias";

export type SpreadsheetCatalogHit = {
  id: string;
  code: string;
  taxRate: number;
  hsnCode?: string | null;
};

export type SpreadsheetQuoteLine = {
  productId: string | null;
  aliasName: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
};

function catalogByCode(products: SpreadsheetCatalogHit[]): Map<string, SpreadsheetCatalogHit> {
  return new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
}

function clientUnitFromSpreadsheet(unit: string): string {
  const raw = unit.replace(/,/g, "").trim();
  if (!raw || /^\d+(\.\d+)?$/.test(raw)) return "";
  return unit.trim();
}

/** Map a quote spreadsheet onto quote lines. Spreadsheet values win over catalog. */
export function quoteLinesFromSpreadsheetItems(
  items: QuoteCsvItem[],
  products: SpreadsheetCatalogHit[] = []
): SpreadsheetQuoteLine[] {
  const byCode = catalogByCode(products);
  return items.map((item) => {
    const hit = item.code ? byCode.get(item.code.trim().toLowerCase()) : undefined;
    const extra = [
      item.extraNotes,
      !hit && item.hsnCode ? `HSN ${item.hsnCode}` : "",
    ]
      .filter(Boolean)
      .join(" — ");
    const presented = quoteLinePresentation({
      clientName: item.productName,
      clientCode: item.code,
      clientBrand: item.brand,
      clientModel: item.model,
      clientUnit: clientUnitFromSpreadsheet(item.unit),
      extraNotes: extra || null,
      catalogName: item.productName || "Item",
    });
    const taxRate =
      item.taxRate != null && item.taxRate >= 0 ? item.taxRate : hit?.taxRate ?? 18;
    return {
      productId: hit?.id ?? null,
      aliasName: presented.aliasName,
      description: presented.description,
      qty: item.quantity > 0 ? item.quantity : 1,
      unit: presented.unit,
      unitPrice: item.unitPrice >= 0 ? item.unitPrice : 0,
      taxRate,
    };
  });
}
