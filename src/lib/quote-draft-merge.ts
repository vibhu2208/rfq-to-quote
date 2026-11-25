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

function unitsEquivalent(a: string | undefined, b: string | undefined): boolean {
  const norm = (u: string | undefined) => {
    const raw = (u || "").trim().toLowerCase().replace(/\./g, "");
    if (!raw || raw === "nos" || raw === "pc" || raw === "pcs" || raw === "each" || raw === "unit" || raw === "units") {
      return "pcs";
    }
    return raw;
  };
  return norm(a) === norm(b);
}

/** True when persisted quote line fields would change after merge. */
export function draftMergeLineMeaningfullyChanged(
  prior: DraftMergeExistingLine,
  next: Pick<DraftMergeOutgoingLine, "productId" | "qty" | "unit">
): boolean {
  if ((prior.productId ?? null) !== (next.productId ?? null)) return true;
  if (Math.abs(prior.qty - next.qty) > 0.000_1) return true;
  if (!unitsEquivalent(prior.unit, next.unit)) return true;
  return false;
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

type NumericTokenKey = "length_m" | "inch" | "qty" | "port";

function extractNumericTokens(text: string): Map<NumericTokenKey, string> {
  const map = new Map<NumericTokenKey, string>();
  const lower = text.toLowerCase();
  const length = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b/);
  if (length) map.set("length_m", length[1]);
  const inch = lower.match(/\b(\d+(?:\.\d+)?)\s*-?\s*inch(?:es)?\b|\b(\d+(?:\.\d+)?)\s*"/);
  const inchVal = inch?.[1] || inch?.[2];
  if (inchVal) map.set("inch", inchVal);
  const xQty = lower.match(/[×x]\s*(\d+(?:[.,]\d+)?)\b/);
  if (xQty) map.set("qty", xQty[1].replace(",", ""));
  const qtyLabel = lower.match(/\bqty\s*:?\s*(\d+(?:[.,]\d+)?)\b/);
  if (qtyLabel) map.set("qty", qtyLabel[1].replace(",", ""));
  const port = lower.match(/\b(\d+)\s*-?\s*port\b/);
  if (port) map.set("port", port[1]);
  return map;
}

/** False when both lines state a size/qty/port count that disagrees (e.g. 2 m vs 1 m). */
export function numericTokensConflict(a: string, b: string): boolean {
  const ta = extractNumericTokens(a);
  const tb = extractNumericTokens(b);
  for (const key of ["length_m", "inch", "qty", "port"] as const) {
    const va = ta.get(key);
    const vb = tb.get(key);
    if (va && vb && va !== vb) return true;
  }
  return false;
}

function aliasMatchesClosely(rowText: string, incomingText: string): boolean {
  const rowLabel = rowText.trim();
  const incomingLabel = incomingText.trim();
  if (!rowLabel || !incomingLabel) return false;
  if (numericTokensConflict(rowLabel, incomingLabel)) return false;
  return (
    lineTextsCompatible(rowLabel, incomingLabel) ||
    lineTextsCompatible(incomingLabel, rowLabel)
  );
}

/** Trust a stored rfqLineId only when catalog or client wording still aligns. */
export function rfqLineBindingTrusted(
  row: DraftMergeExistingLine,
  incoming: DraftMergeIncomingLine
): boolean {
  const clientName = incoming.aliasName?.trim() || "";
  const rowText = row.aliasName?.trim() || row.description?.trim() || "";
  if (!clientName) return false;

  if (incoming.productId && row.productId) {
    if (incoming.productId !== row.productId) return false;
    return aliasMatchesClosely(rowText, clientName);
  }

  if (!row.productId) {
    return aliasMatchesClosely(rowText, clientName);
  }

  return aliasMatchesClosely(rowText, clientName);
}

function rowEligibleForIncoming(
  row: DraftMergeExistingLine,
  incoming: DraftMergeIncomingLine
): boolean {
  if (
    row.rfqLineId != null &&
    row.rfqLineId === incoming.rfqLineId &&
    !rfqLineBindingTrusted(row, incoming)
  ) {
    return false;
  }
  return true;
}

/** Stable rfqLineId match first; legacy rows without rfqLineId fall back to product / wording. */
function matchExisting(
  incoming: DraftMergeIncomingLine,
  pool: DraftMergeExistingLine[],
  used: Set<string>
): { row?: DraftMergeExistingLine; staleBinding?: boolean } {
  const byRfq = pool.find(
    (row) =>
      !used.has(row.id) &&
      row.rfqLineId != null &&
      row.rfqLineId === incoming.rfqLineId
  );
  if (byRfq) {
    if (rfqLineBindingTrusted(byRfq, incoming)) return { row: byRfq };
    return { staleBinding: true };
  }

  const clientName = incoming.aliasName?.trim() || "";
  if (incoming.productId) {
    const byProduct = pool.find(
      (row) =>
        !used.has(row.id) &&
        rowEligibleForIncoming(row, incoming) &&
        row.productId != null &&
        row.productId === incoming.productId &&
        (row.rfqLineId == null || row.rfqLineId === incoming.rfqLineId)
    );
    if (byProduct) return { row: byProduct };
  }

  if (clientName) {
    const byWording = pool.find(
      (row) =>
        !used.has(row.id) &&
        rowEligibleForIncoming(row, incoming) &&
        (row.rfqLineId == null || row.rfqLineId === incoming.rfqLineId) &&
        (lineTextsCompatible(row.aliasName, clientName) ||
          lineTextsCompatible(row.description, clientName))
    );
    if (byWording) return { row: byWording };
  }

  return {};
}

export function draftMergeActionableChanges(changes: DraftMergeChange[]): DraftMergeChange[] {
  return changes.filter((change) => change.kind !== "keep");
}

export type DraftMergeResult = {
  lines: DraftMergeOutgoingLine[];
  changes: DraftMergeChange[];
  /** Legacy quote lines in the draft that could not be tied to an RFQ line. */
  unmatchedExisting: number;
  /** Quote rows whose rfqLineId no longer matches the RFQ line wording/catalog. */
  staleRfqBindings: number;
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
  let staleRfqBindings = 0;
  const clearStaleRfqLineId = new Set<string>();

  for (const row of sortedIncoming) {
    if (seenRfq.has(row.rfqLineId)) continue;
    seenRfq.add(row.rfqLineId);

    const clientName = row.aliasName?.trim() || `Line ${row.rfqLineId}`;
    const staleByRfq = pool.find(
      (candidate) =>
        !usedExisting.has(candidate.id) &&
        candidate.rfqLineId != null &&
        candidate.rfqLineId === row.rfqLineId &&
        !rfqLineBindingTrusted(candidate, row)
    );
    if (staleByRfq) {
      staleRfqBindings += 1;
      clearStaleRfqLineId.add(staleByRfq.id);
    }
    const match = matchExisting(row, pool, usedExisting);
    const prior = match.row;

    if (prior) {
      usedExisting.add(prior.id);
      const nextProductId = row.productId ?? prior.productId;
      const qty = prior.qty > 0 ? prior.qty : row.qty > 0 ? row.qty : 1;
      const incomingUnit = row.unit?.trim() || "";
      const unit =
        prior.unit?.trim() && (!incomingUnit || unitsEquivalent(prior.unit, incomingUnit))
          ? prior.unit
          : incomingUnit || prior.unit || "pcs";
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
        unit,
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
      const fields: string[] = [];
      if ((prior.productId ?? null) !== (nextProductId ?? null)) {
        fields.push("catalog");
      }
      if (Math.abs(prior.qty - qty) > 0.000_1) {
        fields.push("qty");
      }
      if (!unitsEquivalent(prior.unit, unit)) {
        fields.push("unit");
      }
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
      rfqLineId: clearStaleRfqLineId.has(row.id) ? null : row.rfqLineId ?? null,
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

  return { lines: merged, changes, unmatchedExisting, staleRfqBindings };
}