import { isHsnMissingOrInvalid } from "@/lib/hsn";
import { buyerRequiredGaps } from "@/lib/quote-buyer-required";
import { normalizeQuoteUnit } from "@/lib/quote-format";

export type ReadinessFix =
  | "buyer"
  | "price"
  | "hsn"
  | "warranty"
  | "stock"
  | "terms"
  | "rfq";

export type ReadinessGap = {
  id: string;
  message: string;
  fix: ReadinessFix;
  lineIndex?: number;
};

export type ReadinessLine = {
  name?: string;
  unitPrice: number;
  hsnCode?: string | null;
  warrantyQty?: number | null;
  productId?: string | null;
  customItem?: boolean;
  qty?: number;
  unit?: string;
};

export type RfqCoverageItem = {
  lineNumber?: number;
  description: string;
  quantity: number;
  unit: string;
};

function normName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unitsDiffer(a?: string | null, b?: string | null) {
  const left = normalizeQuoteUnit(a || "pcs");
  const right = normalizeQuoteUnit(b || "pcs");
  return left !== right;
}

function lineCoversRfqItem(
  line: ReadinessLine,
  item: RfqCoverageItem
): boolean {
  const lineName = normName(line.name || "");
  const itemName = normName(item.description || "");
  if (!lineName || !itemName) return false;
  return lineName.includes(itemName) || itemName.includes(lineName);
}

export function collectReadinessGaps(input: {
  buyerCompany?: string | null;
  buyerAddress?: string | null;
  buyerState?: string | null;
  validityMissing?: boolean;
  lines: ReadinessLine[];
  warrantyAsked?: boolean;
  /** productId → quantity available to quote. Missing ids are unknown, not out of stock. */
  stockByProductId?: Record<string, number | undefined>;
  termsMissing?: boolean;
  rfqItems?: RfqCoverageItem[];
}): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  const buyerFields = buyerRequiredGaps({
    buyerCompany: input.buyerCompany,
    buyerAddress: input.buyerAddress,
    buyerState: input.buyerState,
  });
  for (const field of buyerFields) {
    gaps.push({
      id: `buyer-${field.replace(/\s+/g, "-")}`,
      message: `Buyer details incomplete (${field})`,
      fix: "buyer",
    });
  }

  input.lines.forEach((line, index) => {
    const name = line.name?.trim() || `Line ${index + 1}`;
    if (!(Number(line.unitPrice) > 0)) {
      gaps.push({
        id: `price-${index}`,
        message: `${name} has no sell price`,
        fix: "price",
        lineIndex: index,
      });
    }
    if (isHsnMissingOrInvalid(line.hsnCode)) {
      gaps.push({
        id: `hsn-${index}`,
        message: `${name} is missing a valid HSN`,
        fix: "hsn",
        lineIndex: index,
      });
    }
    const stock =
      line.productId && input.stockByProductId
        ? input.stockByProductId[line.productId]
        : undefined;
    const lineQty = Number(line.qty);
    if (
      line.productId &&
      stock != null &&
      Number.isFinite(lineQty) &&
      lineQty > 0 &&
      lineQty > stock
    ) {
      gaps.push({
        id: `stock-${index}`,
        message: `${name} exceeds available stock (${stock} on hand)`,
        fix: "stock",
        lineIndex: index,
      });
    } else if (line.productId && stock != null && stock <= 0 && lineQty > 0) {
      gaps.push({
        id: `stock-${index}`,
        message: `${name} is out of stock`,
        fix: "stock",
        lineIndex: index,
      });
    }
    if (input.warrantyAsked && !(Number(line.warrantyQty) > 0)) {
      gaps.push({
        id: `warranty-${index}`,
        message: `${name} has no warranty, and the RFQ asked for one`,
        fix: "warranty",
        lineIndex: index,
      });
    }
  });

  if (input.termsMissing) {
    gaps.push({
      id: "terms",
      message: "Delivery was asked in the RFQ and is not specified",
      fix: "terms",
    });
  }

  if (input.validityMissing) {
    gaps.push({
      id: "validity",
      message: "Quote validity is not specified",
      fix: "terms",
    });
  }

  const rfqItems = input.rfqItems ?? [];
  if (rfqItems.length > 0) {
    const uncovered = rfqItems.filter(
      (item) => !input.lines.some((line) => lineCoversRfqItem(line, item))
    );
    for (const item of uncovered) {
      const label = item.description.trim() || `Line ${item.lineNumber ?? "?"}`;
      gaps.push({
        id: `rfq-missing-${item.lineNumber ?? label}`,
        message: `RFQ item not on quote: ${label}`,
        fix: "rfq",
      });
    }

    input.lines.forEach((line, index) => {
      const name = line.name?.trim() || `Line ${index + 1}`;
      const match = rfqItems.find((item) => lineCoversRfqItem(line, item));
      if (!match) return;
      const lineQty = Number(line.qty);
      const rfqQty = Number(match.quantity);
      if (
        Number.isFinite(lineQty) &&
        Number.isFinite(rfqQty) &&
        lineQty > 0 &&
        rfqQty > 0 &&
        lineQty !== rfqQty
      ) {
        gaps.push({
          id: `rfq-qty-${index}`,
          message: `${name} qty ${lineQty} does not match RFQ (${rfqQty})`,
          fix: "rfq",
          lineIndex: index,
        });
      }
      if (unitsDiffer(line.unit, match.unit)) {
        gaps.push({
          id: `rfq-unit-${index}`,
          message: `${name} unit (${line.unit || "pcs"}) does not match RFQ (${match.unit || "pcs"})`,
          fix: "rfq",
          lineIndex: index,
        });
      }
    });
  }

  return gaps;
}