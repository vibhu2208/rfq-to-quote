import { isHsnMissingOrInvalid } from "@/lib/hsn";
import { buyerRequiredGaps } from "@/lib/quote-buyer-required";

export type ReadinessFix =
  | "buyer"
  | "price"
  | "hsn"
  | "warranty"
  | "stock"
  | "terms";

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
};

export function collectReadinessGaps(input: {
  buyerCompany?: string | null;
  buyerAddress?: string | null;
  buyerState?: string | null;
  lines: ReadinessLine[];
  warrantyAsked?: boolean;
  /** productId → quantity on hand. Missing ids are unknown, not out of stock. */
  stockByProductId?: Record<string, number | undefined>;
  termsMissing?: boolean;
}): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  const buyer = buyerRequiredGaps({
    buyerCompany: input.buyerCompany,
    buyerAddress: input.buyerAddress,
    buyerState: input.buyerState,
  });
  if (buyer.length > 0) {
    gaps.push({
      id: "buyer",
      message: `Buyer details incomplete (${buyer.join(", ")})`,
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
    if (line.productId && stock != null && stock <= 0) {
      gaps.push({
        id: `stock-${index}`,
        message: `${name} is out of stock`,
        fix: "stock",
        lineIndex: index,
      });
    }
  });

  if (input.warrantyAsked) {
    const unanswered = input.lines.every((line) => !(Number(line.warrantyQty) > 0));
    if (unanswered && input.lines.length > 0) {
      gaps.push({
        id: "warranty",
        message: "Warranty was asked in the RFQ and is not specified",
        fix: "warranty",
      });
    }
  }

  if (input.termsMissing) {
    gaps.push({
      id: "terms",
      message: "Delivery was asked in the RFQ and is not specified",
      fix: "terms",
    });
  }

  return gaps;
}
