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
  /** Previously saved values — used when a field is manually overridden */
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeState(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveGstSplit(
  withGst: boolean,
  buyerState: string,
  sellerState: string,
  gstMode: "AUTO" | "CGST_SGST" | "IGST" = "AUTO"
): "CGST_SGST" | "IGST" | "NONE" {
  if (!withGst) return "NONE";
  if (gstMode === "CGST_SGST") return "CGST_SGST";
  if (gstMode === "IGST") return "IGST";
  const buyer = normalizeState(buyerState);
  const seller = normalizeState(sellerState);
  if (!buyer || !seller) return "CGST_SGST";
  return buyer === seller ? "CGST_SGST" : "IGST";
}

/**
 * Calculates quote totals. Fields flagged in `overrides` keep `previous` values
 * instead of being recalculated.
 */
export function calculateQuoteTotals(input: QuoteCalcInput): QuoteCalcResult {
  const overrides = input.overrides ?? {};
  const prev = input.previous ?? {};

  const lineTotals = input.lines.map((l) => round2(Number(l.qty) * Number(l.unitPrice)));

  const subtotal = overrides.subtotal && prev.subtotal != null ? prev.subtotal : round2(lineTotals.reduce((a, b) => a + b, 0));

  let discountAmount: number;
  if (overrides.discountAmount && prev.discountAmount != null) {
    discountAmount = prev.discountAmount;
  } else if (input.discountAmount != null && input.discountAmount > 0 && !(input.discountPercent && input.discountPercent > 0)) {
    discountAmount = round2(input.discountAmount);
  } else if (input.discountPercent && input.discountPercent > 0) {
    discountAmount = round2((subtotal * Number(input.discountPercent)) / 100);
  } else {
    discountAmount = round2(input.discountAmount ?? 0);
  }

  const taxable = round2(Math.max(0, subtotal - discountAmount));

  const deliveryCharge =
    overrides.deliveryCharge && prev.deliveryCharge != null
      ? prev.deliveryCharge
      : round2(input.deliveryCharge ?? 0);

  const otherTaxAmount =
    overrides.otherTaxAmount && prev.otherTaxAmount != null
      ? prev.otherTaxAmount
      : round2(input.otherTaxAmount ?? 0);

  const split = resolveGstSplit(
    input.withGst,
    input.buyerState,
    input.sellerState,
    input.gstMode ?? "AUTO"
  );

  let gstAmount = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (overrides.gstAmount && prev.gstAmount != null) {
    gstAmount = prev.gstAmount;
    cgstAmount = prev.cgstAmount ?? round2(gstAmount / 2);
    sgstAmount = prev.sgstAmount ?? round2(gstAmount / 2);
    igstAmount = prev.igstAmount ?? (split === "IGST" ? gstAmount : 0);
  } else if (split !== "NONE") {
    // Weighted GST from line rates against taxable base
    const grossLines = lineTotals.reduce((a, b) => a + b, 0) || 1;
    gstAmount = round2(
      input.lines.reduce((sum, line, i) => {
        const share = lineTotals[i] / grossLines;
        const lineTaxable = taxable * share;
        return sum + (lineTaxable * Number(line.taxRate)) / 100;
      }, 0)
    );

    if (split === "CGST_SGST") {
      cgstAmount = round2(gstAmount / 2);
      sgstAmount = round2(gstAmount - cgstAmount);
      igstAmount = 0;
    } else {
      igstAmount = gstAmount;
      cgstAmount = 0;
      sgstAmount = 0;
    }
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
    gstSplit: split,
    otherTaxAmount,
    deliveryCharge,
    grandTotal,
  };
}

export function formatMoney(n: number | string, currency = "INR"): string {
  const value = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0);
}
