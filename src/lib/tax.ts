import { calculateDocumentTotals } from "@/lib/accounting/tax-engine";
import { getStateCode, normalizeState } from "@/lib/accounting/states";
import { formatMoney, round2 } from "@/lib/accounting/money";

export type ManualOverrides = {
  subtotal?: boolean;
  gstAmount?: boolean;
  otherTaxAmount?: boolean;
  deliveryCharge?: boolean;
  discountAmount?: boolean;
  grandTotal?: boolean;
};

export type LineInput = {
  qty: number;
  unitPrice: number;
  taxRate: number;
};

export type QuoteCalcInput = {
  lines: LineInput[];
  withGst: boolean;
  buyerState: string;
  sellerState: string;
  gstMode?: "AUTO" | "CGST_SGST" | "IGST";
  deliveryCharge?: number;
  discountPercent?: number;
  discountAmount?: number;
  otherTaxAmount?: number;
  overrides?: ManualOverrides;
  previous?: Partial<{
    subtotal: number;
    gstAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    otherTaxAmount: number;
    deliveryCharge: number;
    discountAmount: number;
    grandTotal: number;
  }>;
};

export type QuoteCalcResult = {
  lineTotals: number[];
  subtotal: number;
  discountAmount: number;
  taxable: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstSplit: "CGST_SGST" | "IGST" | "NONE";
  otherTaxAmount: number;
  deliveryCharge: number;
  grandTotal: number;
};

export function resolveGstSplit(
  withGst: boolean,
  buyerState: string,
  sellerState: string,
  gstMode: "AUTO" | "CGST_SGST" | "IGST" = "AUTO"
): "CGST_SGST" | "IGST" | "NONE" {
  if (!withGst) return "NONE";
  if (gstMode === "CGST_SGST") return "CGST_SGST";
  if (gstMode === "IGST") return "IGST";
  const buyerCode = getStateCode(buyerState);
  const sellerCode = getStateCode(sellerState);
  if (buyerCode && sellerCode) {
    return buyerCode === sellerCode ? "CGST_SGST" : "IGST";
  }
  const buyer = normalizeState(buyerState);
  const seller = normalizeState(sellerState);
  if (!buyer || !seller) return "CGST_SGST";
  return buyer === seller ? "CGST_SGST" : "IGST";
}

/**
 * Quote preview calculator. Prefer calculateDocumentTotals for statutory invoices.
 * Manual override fields keep previous values for backwards-compatible quote editing.
 */
export function calculateQuoteTotals(input: QuoteCalcInput): QuoteCalcResult {
  const overrides = input.overrides ?? {};
  const prev = input.previous ?? {};

  const lineTotals = input.lines.map((line) =>
    round2(Number(line.qty) * Number(line.unitPrice))
  );

  const subtotal =
    overrides.subtotal && prev.subtotal != null
      ? prev.subtotal
      : round2(lineTotals.reduce((a, b) => a + b, 0));

  let discountAmount: number;
  if (overrides.discountAmount && prev.discountAmount != null) {
    discountAmount = prev.discountAmount;
  } else if (
    input.discountAmount != null &&
    input.discountAmount > 0 &&
    !(input.discountPercent && input.discountPercent > 0)
  ) {
    discountAmount = round2(input.discountAmount);
  } else if (input.discountPercent && input.discountPercent > 0) {
    discountAmount = round2((subtotal * Number(input.discountPercent)) / 100);
  } else {
    discountAmount = round2(input.discountAmount ?? 0);
  }

  const deliveryCharge =
    overrides.deliveryCharge && prev.deliveryCharge != null
      ? prev.deliveryCharge
      : round2(input.deliveryCharge ?? 0);

  const otherTaxAmount =
    overrides.otherTaxAmount && prev.otherTaxAmount != null
      ? prev.otherTaxAmount
      : round2(input.otherTaxAmount ?? 0);

  const sellerCode = getStateCode(input.sellerState) ?? "27";
  const buyerCode = getStateCode(input.buyerState) ?? sellerCode;
  const gstSplit = resolveGstSplit(
    input.withGst,
    input.buyerState,
    input.sellerState,
    input.gstMode ?? "AUTO"
  );

  let taxable = round2(Math.max(0, subtotal - discountAmount));
  let gstAmount = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (overrides.gstAmount && prev.gstAmount != null) {
    gstAmount = prev.gstAmount;
    cgstAmount = prev.cgstAmount ?? round2(gstAmount / 2);
    sgstAmount = prev.sgstAmount ?? round2(gstAmount - cgstAmount);
    igstAmount = prev.igstAmount ?? (gstSplit === "IGST" ? gstAmount : 0);
  } else if (input.withGst) {
    const calc = calculateDocumentTotals({
      lines: input.lines.map((line) => ({
        qty: line.qty,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
      })),
      sellerStateCode: sellerCode,
      placeOfSupplyCode: buyerCode,
      withGst: true,
      headerDiscountAmount: discountAmount,
      freightAmount: deliveryCharge,
      freightTaxable: false,
      gstMode: input.gstMode ?? "AUTO",
    });

    taxable = round2(Math.max(0, subtotal - discountAmount));
    gstAmount = calc.gstAmount;
    cgstAmount = calc.cgstAmount;
    sgstAmount = calc.sgstAmount;
    igstAmount = calc.igstAmount;
  }

  let grandTotal: number;
  if (overrides.grandTotal && prev.grandTotal != null) {
    grandTotal = prev.grandTotal;
  } else {
    grandTotal = round2(taxable + gstAmount + otherTaxAmount + deliveryCharge);
  }

  return {
    lineTotals,
    subtotal,
    discountAmount,
    taxable,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstSplit,
    otherTaxAmount,
    deliveryCharge,
    grandTotal,
  };
}

export { formatMoney, calculateDocumentTotals };
