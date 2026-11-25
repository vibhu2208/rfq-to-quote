import { round2 } from "@/lib/accounting/money";
import { effectiveUnitPrice } from "@/lib/quote-discount";

export type DraftMergeExistingLine = {
  id: string;
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

function normAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

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

function matchExisting(
  incoming: DraftMergeIncomingLine,
  pool: DraftMergeExistingLine[],
  used: Set<string>
): DraftMergeExistingLine | undefined {
  const byRfq = pool.find(
    (row) => !used.has(row.id) && row.sortOrder === incoming.rfqLineId
  );
  if (byRfq) return byRfq;

  const incomingAlias = normAlias(incoming.aliasName || "");
  if (incoming.productId) {
    const byProduct = pool.find(
      (row) =>
        !used.has(row.id) &&
        row.productId === incoming.productId &&
        (!incomingAlias ||
          !row.aliasName ||
          normAlias(row.aliasName) === incomingAlias)
    );
    if (byProduct) return byProduct;
  }

  if (incomingAlias) {
    const byAlias = pool.find(
      (row) => !used.has(row.id) && normAlias(row.aliasName) === incomingAlias
    );
    if (byAlias) return byAlias;
  }

  if (!incoming.productId) {
    const manual = pool.find(
      (row) =>
        !used.has(row.id) &&
        row.productId == null &&
        incomingAlias &&
        normAlias(row.aliasName) === incomingAlias
    );
    if (manual) return manual;
  }

  return undefined;
}

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
): { lines: DraftMergeOutgoingLine[]; changes: DraftMergeChange[] } {
  const sortedIncoming = [...incoming].sort((a, b) => a.rfqLineId - b.rfqLineId);
  const seenRfq = new Set<number>();
  const usedExisting = new Set<string>();
  const merged: DraftMergeOutgoingLine[] = [];
  const changes: DraftMergeChange[] = [];
  const pool = [...existing].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const row of sortedIncoming) {
    if (seenRfq.has(row.rfqLineId)) continue;
    seenRfq.add(row.rfqLineId);

    const clientName = row.aliasName?.trim() || `Line ${row.rfqLineId}`;
    const prior = matchExisting(row, pool, usedExisting);

    if (prior) {
      usedExisting.add(prior.id);
      const fields: string[] = [];
      if (prior.productId !== row.productId) fields.push("catalog");
      const qty = prior.qty > 0 ? prior.qty : row.qty > 0 ? row.qty : 1;
      const unitPrice =
        prior.unitPrice > 0
          ? prior.unitPrice
          : pickCatalogPrice(row.productId, row.unitPrice, opts?.catalogUnitPrice);
      const next: DraftMergeOutgoingLine = {
        id: prior.id,
        productId: row.productId ?? prior.productId,
        aliasName: clientName || prior.aliasName,
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
        sortOrder: row.rfqLineId,
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
      aliasName: clientName,
      description: "",
      qty,
      unit: row.unit?.trim() || "pcs",
      unitPrice,
      costPrice: row.costPrice != null && row.costPrice > 0 ? row.costPrice : null,
      costVendorName: row.costVendorName?.trim() || "",
      discountPercent: 0,
      taxRate: 18,
      sortOrder: row.rfqLineId,
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

  merged.sort((a, b) => a.sortOrder - b.sortOrder || a.aliasName.localeCompare(b.aliasName));
  return { lines: merged, changes };
}