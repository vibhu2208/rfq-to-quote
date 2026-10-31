import { DEFAULT_QUOTE_UNIT, normalizeQuoteUnit } from "@/lib/quote-format";

export type AliasSnapshotLine = {
  key: string;
  aliasName: string;
  catalogName?: string;
};

export function snapshotLineAliases(
  lines: Array<Pick<AliasSnapshotLine, "key" | "aliasName">>
): Record<string, string> {
  return Object.fromEntries(lines.map((line) => [line.key, line.aliasName]));
}

export function applyCatalogNamesToAliases<T extends AliasSnapshotLine>(lines: T[]): T[] {
  return lines.map((line) => ({
    ...line,
    aliasName: (line.catalogName || line.aliasName).trim(),
  }));
}

export function restoreLineAliases<T extends Pick<AliasSnapshotLine, "key" | "aliasName">>(
  lines: T[],
  snapshot: Record<string, string> | null
): T[] {
  if (!snapshot) return lines;
  return lines.map((line) =>
    Object.prototype.hasOwnProperty.call(snapshot, line.key)
      ? { ...line, aliasName: snapshot[line.key] }
      : line
  );
}

/** Customer-facing name on a quote line. Catalog names are for matching only. */
export function quoteLineAliasFromClient(
  clientName: string | null | undefined,
  catalogName: string
): string {
  const client = clientName?.trim() || "";
  return client || catalogName;
}

function unitKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const UNIT_ALIASES: Record<string, string> = {
  no: "nos",
  nos: "nos",
  "no s": "nos",
  each: "nos",
  unit: "nos",
  units: "nos",
  pc: "pcs",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  set: "set",
  sets: "set",
  box: "box",
  boxes: "box",
  pkt: "pkt",
  pack: "pkt",
  packet: "pkt",
  bag: "bag",
  ctn: "ctn",
  carton: "ctn",
  doz: "doz",
  dozen: "doz",
  prs: "prs",
  pair: "prs",
  pairs: "prs",
  rol: "rol",
  roll: "rol",
  mtr: "mtr",
  meter: "mtr",
  metre: "mtr",
  sqm: "sqm",
  kgs: "kgs",
  kg: "kgs",
  ltr: "ltr",
  liter: "ltr",
  litre: "ltr",
  lot: "lot",
};

/** Prefer the unit from the client's document; never replace it with catalog UOM. */
export function clientQuoteUnit(
  clientUnit?: string | null,
  catalogUnit?: string | null
): string {
  const raw = clientUnit?.trim() || "";
  if (raw) {
    const aliased = UNIT_ALIASES[unitKey(raw)];
    return aliased || normalizeQuoteUnit(raw);
  }
  if (catalogUnit?.trim()) return normalizeQuoteUnit(catalogUnit);
  return DEFAULT_QUOTE_UNIT;
}

function alreadyCovered(haystack: string, piece: string): boolean {
  const h = haystack.toLowerCase();
  const p = piece.toLowerCase();
  return h === p || (p.length >= 2 && h.includes(p));
}

export function quoteLinePresentation(input: {
  clientName?: string | null;
  clientCode?: string | null;
  clientBrand?: string | null;
  clientModel?: string | null;
  clientUnit?: string | null;
  extraNotes?: string | null;
  catalogName: string;
  catalogDescription?: string | null;
  catalogUnit?: string | null;
}): { aliasName: string; description: string; unit: string } {
  const aliasName = quoteLineAliasFromClient(input.clientName, input.catalogName);
  const parts: string[] = [];
  const push = (value?: string | null) => {
    const v = value?.trim();
    if (!v) return;
    if (alreadyCovered(aliasName, v)) return;
    if (parts.some((p) => alreadyCovered(p, v) || alreadyCovered(v, p))) return;
    parts.push(v);
  };

  push(input.clientCode);
  push(input.clientBrand);
  push(input.clientModel);
  push(input.extraNotes);
  push(input.catalogDescription);

  return {
    aliasName,
    description: parts.join(" — "),
    unit: clientQuoteUnit(input.clientUnit, input.catalogUnit),
  };
}

/**
 * Pick the RFQ requirement for a catalog product.
 * Prefers the requirement whose top catalog match is this product, so skipped
 * lines do not steal a later product's client name.
 */
export function requirementForProduct<T>(input: {
  productId: string;
  lineIndex: number;
  requirements: T[];
  topMatchProductIds: Array<string | undefined>;
  claimed: Set<number>;
}): T | undefined {
  for (let i = 0; i < input.topMatchProductIds.length; i++) {
    if (input.claimed.has(i)) continue;
    if (input.topMatchProductIds[i] === input.productId) {
      input.claimed.add(i);
      return input.requirements[i];
    }
  }

  if (
    input.topMatchProductIds.length === input.requirements.length &&
    !input.claimed.has(input.lineIndex) &&
    input.requirements[input.lineIndex]
  ) {
    input.claimed.add(input.lineIndex);
    return input.requirements[input.lineIndex];
  }

  return undefined;
}

export function requirementDescriptionForProduct(input: {
  productId: string;
  lineIndex: number;
  requirements: Array<{ description: string }>;
  topMatchProductIds: Array<string | undefined>;
  claimed: Set<number>;
}): string {
  return requirementForProduct(input)?.description?.trim() || "";
}
