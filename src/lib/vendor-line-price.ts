export type VendorLinePriceSource = "Vendor reply" | "Last quoted";

export type VendorPriceLine = {
  lineNumber: number;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice: number | null;
  lineTotal?: number | null;
};

export type VendorPriceMatch = {
  vendor: { id: string; name: string };
  outreach?: {
    status?: string;
    quotedPrice?: number | null;
    quotedLineItems?: Array<{
      lineNumber: number;
      unitPrice: number;
      lineTotal?: number;
      description?: string;
      quantity?: number;
      unit?: string;
    }>;
    requestedLineNumbers?: number[] | null;
  } | null;
  matchedLines?: VendorPriceLine[];
};

export type VendorLineCost = {
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  source: VendorLinePriceSource;
  description?: string;
  quantity?: number;
  unit?: string;
};

function usablePrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function vendorUnitCostForLine(
  match: VendorPriceMatch,
  lineNumber: number
): VendorLineCost | null {
  if (match.outreach?.status === "DECLINED") return null;

  const quotedLines = match.outreach?.quotedLineItems || [];
  const quoted = quotedLines.find((line) => line.lineNumber === lineNumber);
  const quotedPrice = quoted ? usablePrice(quoted.unitPrice) : null;
  if (quotedPrice != null) {
    return {
      vendorId: match.vendor.id,
      vendorName: match.vendor.name,
      unitPrice: quotedPrice,
      source: "Vendor reply",
      description: quoted?.description,
      quantity: quoted?.quantity,
      unit: quoted?.unit,
    };
  }

  if (quotedLines.length === 0) {
    const lump = usablePrice(match.outreach?.quotedPrice);
    if (lump != null) {
      const requested = match.outreach?.requestedLineNumbers;
      const singleRequested =
        requested != null && requested.length === 1 && requested[0] === lineNumber;
      const singleMatch =
        (requested == null || requested.length === 0) &&
        (match.matchedLines?.length ?? 0) <= 1;
      if (singleRequested || singleMatch) {
        const matched = match.matchedLines?.find((line) => line.lineNumber === lineNumber);
        return {
          vendorId: match.vendor.id,
          vendorName: match.vendor.name,
          unitPrice: lump,
          source: "Vendor reply",
          description: matched?.description,
          quantity: matched?.quantity,
          unit: matched?.unit,
        };
      }
    }
  }

  const last = match.matchedLines?.find((line) => line.lineNumber === lineNumber);
  const lastPrice = last ? usablePrice(last.unitPrice) : null;
  if (lastPrice != null) {
    return {
      vendorId: match.vendor.id,
      vendorName: match.vendor.name,
      unitPrice: lastPrice,
      source: "Last quoted",
      description: last?.description,
      quantity: last?.quantity,
      unit: last?.unit,
    };
  }

  return null;
}

export function vendorsWithPriceForLine(
  vendorMatches: VendorPriceMatch[],
  lineNumber: number
): VendorLineCost[] {
  const options: VendorLineCost[] = [];
  for (const match of vendorMatches) {
    const cost = vendorUnitCostForLine(match, lineNumber);
    if (cost) options.push(cost);
  }
  return options;
}

export function vendorPricedLineNumbers(match: VendorPriceMatch): number[] {
  const fromReply = (match.outreach?.quotedLineItems || [])
    .map((line) => line.lineNumber)
    .filter((n) => vendorUnitCostForLine(match, n) != null);
  const fromMatch = (match.matchedLines || [])
    .map((line) => line.lineNumber)
    .filter((n) => vendorUnitCostForLine(match, n) != null);
  return [...new Set([...fromReply, ...fromMatch])].sort((a, b) => a - b);
}

export function vendorCostTotal(
  match: VendorPriceMatch,
  lineNumbers?: number[]
): number | null {
  const lines =
    lineNumbers && lineNumbers.length > 0
      ? lineNumbers
      : vendorPricedLineNumbers(match);
  if (lines.length === 0) return null;
  let total = 0;
  let priced = 0;
  for (const lineNumber of lines) {
    const cost = vendorUnitCostForLine(match, lineNumber);
    if (!cost) continue;
    const qty =
      cost.quantity && cost.quantity > 0
        ? cost.quantity
        : match.matchedLines?.find((line) => line.lineNumber === lineNumber)?.quantity || 1;
    total += cost.unitPrice * qty;
    priced += 1;
  }
  return priced > 0 ? total : null;
}
