import { round2 } from "@/lib/accounting/money";
import { effectiveUnitPrice } from "@/lib/quote-discount";

export type DraftMergeExistingLine = {
  id: string;
  rfqLineId?: number | null;
  productId: string | null;
  aliasName: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  costPrice?: number | null;
  costVendorName?: string;
  discountPercent: number;
  taxRate: number;
  sortOrder: number;
  customItem?: boolean;
};

export type DraftMergeIncomingLine = {
  rfqLineId: number;
  productId: string | null;
  aliasName?: string;
  unit?: string;
  qty: number;
  unitPrice?: number;
  costPrice?: number;
  costVendorName?: string;
};

export type DraftMergeOutgoingLine = Omit<DraftMergeExistingLine, "id"> & {
  id?: string;
  rfqLineId?: number | null;
  lineTotal: number;
};

export type DraftMergeChange =
  | {
      kind: "add";
      rfqLineId: number;
      aliasName: string;
    }
  | {
      kind: "update";
      rfqLineId: number;
      aliasName: string;
      fields: string[];
    }
  | {
      kind: "keep";
      id: string;
      aliasName: string;
    };

function lineTotal(line: {
  qty: number;
  unitPrice: number;
  discountPercent: number;
}): number {
  const net = effectiveUnitPrice(line.unitPrice, line.discountPercent);
  return round2(line.qty * net);
}

function pickCatalogPrice(
  productId: string | null,
  hinted: number | undefined,
  catalogPrice?: (productId: string) => number | undefined
): number {
  if (productId && catalogPrice) {
    const fromCatalog = catalogPrice(productId);
    if (fromCatalog != null && fromCatalog > 0) return fromCatalog;
  }
  if (hinted != null && hinted > 0) return hinted;
  return 0;
}

function normLineText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[×x]\s*\d+(?:[.,]\d+)?/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineTextsCompatible(a: string, b: string): boolean {
  const na = normLineText(a);
  const nb = normLineText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 2));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) overlap += 1;
  }
  return overlap >= Math.min(2, ta.size);
}

/** Stable rfqLineId match first; legacy rows without rfqLineId fall back to product / wording. */
function matchExisting(
  incoming: DraftMergeIncomingLine,
  pool: DraftMergeExistingLine[],
  used: Set<string>
): DraftMergeExistingLine | undefined {
  const byRfq = pool.find(
    (row) =>
      !used.has(row.id) &&
      row.rfqLineId != null &&
      row.rfqLineId === incoming.rfqLineId
  );
  if (byRfq) return byRfq;

  const clientName = incoming.aliasName?.trim() || "";
  if (incoming.productId) {
    const byProduct = pool.find(
      (row) =>
        !used.has(row.id) &&
        row.productId != null &&
        row.productId === incoming.productId &&
        (row.rfqLineId == null || row.rfqLineId === incoming.rfqLineId)
    );
    if (byProduct) return byProduct;
  }

  if (clientName) {
    const byWording = pool.find(
      (row) =>
        !used.has(row.id) &&
        (row.rfqLineId == null || row.rfqLineId === incoming.rfqLineId) &&
        (lineTextsCompatible(row.aliasName, clientName) ||
          lineTextsCompatible(row.description, clientName))
    );
    if (byWording) return byWording;
  }

  return undefined;
}

export function draftMergeActionableChanges(changes: DraftMergeChange[]): DraftMergeChange[] {
  return changes.filter((change) => change.kind !== "keep");
}

export type DraftMergeResult = {
  lines: DraftMergeOutgoingLine[];
  changes: DraftMergeChange[];
  /** Legacy quote lines in the draft that could not be tied to an RFQ line. */
  unmatchedExisting: number;
};

/**
 * Merge RFQ workspace lines into an existing draft without duplicating rows or
 * wiping trader-edited qty / sell / discount / tax on matched lines.
 */
export function mergeDraftQuoteLines(
  existing: DraftMergeExistingLine[],
  incoming: DraftMergeIncomingLine[],
  opts?: {
    catalogUnitPrice?: (productId: string) => number | undefined;
  }
): DraftMergeResult {
  const sortedIncoming = [...incoming].sort((a, b) => a.rfqLineId - b.rfqLineId);
  const seenRfq = new Set<number>();
  const usedExisting = new Set<string>();
  const merged: DraftMergeOutgoingLine[] = [];
  const changes: DraftMergeChange[] = [];
  const pool = [...existing];

  for (const row of sortedIncoming) {
    if (seenRfq.has(row.rfqLineId)) continue;
    seenRfq.add(row.rfqLineId);

    const clientName = row.aliasName?.trim() || `Line ${row.rfqLineId}`;
    const prior = matchExisting(row, pool, usedExisting);

    if (prior) {
      usedExisting.add(prior.id);
      const fields: string[] = [];
      const nextProductId = row.productId ?? prior.productId;
      if ((prior.productId ?? null) !== (nextProductId ?? null)) {
        fields.push("catalog");
      }
      if (prior.rfqLineId == null) {
        fields.push("rfqLineId");
      }
      const qty = prior.qty > 0 ? prior.qty : row.qty > 0 ? row.qty : 1;
      const unitPrice =
        prior.unitPrice > 0
          ? prior.unitPrice
          : pickCatalogPrice(row.productId, row.unitPrice, opts?.catalogUnitPrice);
      const next: DraftMergeOutgoingLine = {
        id: prior.id,
        rfqLineId: row.rfqLineId,
        productId: nextProductId,
        aliasName: prior.aliasName?.trim() ? prior.aliasName : clientName,
        description: prior.description,
        qty,
        unit: row.unit?.trim() || prior.unit || "pcs",
        unitPrice,
        costPrice:
          row.costPrice != null && row.costPrice > 0
            ? row.costPrice
            : prior.costPrice,
        costVendorName: row.costVendorName?.trim() || prior.costVendorName || "",
        discountPercent: prior.discountPercent ?? 0,
        taxRate: prior.taxRate,
        sortOrder: prior.sortOrder,
        customItem: prior.customItem,
        lineTotal: 0,
      };
      next.lineTotal = lineTotal(next);
      merged.push(next);
      changes.push(
        fields.length > 0
          ? { kind: "update", rfqLineId: row.rfqLineId, aliasName: next.aliasName, fields }
          : { kind: "keep", id: prior.id, aliasName: next.aliasName }
      );
      continue;
    }

    const unitPrice = pickCatalogPrice(
      row.productId,
      row.unitPrice,
      opts?.catalogUnitPrice
    );
    const qty = row.qty > 0 ? row.qty : 1;
    const created: DraftMergeOutgoingLine = {
      productId: row.productId,
      rfqLineId: row.rfqLineId,
      aliasName: clientName,
      description: "",
      qty,
      unit: row.unit?.trim() || "pcs",
      unitPrice,
      costPrice: row.costPrice != null && row.costPrice > 0 ? row.costPrice : null,
      costVendorName: row.costVendorName?.trim() || "",
      discountPercent: 0,
      taxRate: 18,
      sortOrder: merged.length,
      customItem: !row.productId,
      lineTotal: 0,
    };
    created.lineTotal = lineTotal(created);
    merged.push(created);
    changes.push({ kind: "add", rfqLineId: row.rfqLineId, aliasName: created.aliasName });
  }

  for (const row of pool) {
    if (usedExisting.has(row.id)) continue;
    const preserved: DraftMergeOutgoingLine = {
      ...row,
      lineTotal: lineTotal(row),
    };
    merged.push(preserved);
    changes.push({ kind: "keep", id: row.id, aliasName: row.aliasName });
  }

  merged.sort(
    (a, b) =>
      (a.rfqLineId ?? 999_999) - (b.rfqLineId ?? 999_999) ||
      a.sortOrder - b.sortOrder ||
      a.aliasName.localeCompare(b.aliasName)
  );

  const unmatchedExisting = pool.filter(
    (row) =>
      !usedExisting.has(row.id) &&
      row.rfqLineId == null &&
      !row.customItem &&
      Boolean(row.productId || row.aliasName?.trim())
  ).length;

  return { lines: merged, changes, unmatchedExisting };
}