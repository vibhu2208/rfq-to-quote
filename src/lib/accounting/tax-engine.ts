import { round2 } from "@/lib/accounting/money";
import { getStateCode } from "@/lib/accounting/states";

export const TAX_RULE_VERSION = "gst-domestic-goods-v1";

export type TaxLineInput = {
  qty: number;
  unitPrice: number;
  taxRate: number;
  discountAmount?: number;
};

export type DocumentTaxInput = {
  lines: TaxLineInput[];
  sellerStateCode: string;
  placeOfSupplyCode: string;
  withGst?: boolean;
  headerDiscountAmount?: number;
  discountAmount?: number;
  discountPercent?: number;
  freightAmount?: number;
  freightTaxable?: boolean;
  freightTaxRate?: number;
  gstMode?: "AUTO" | "CGST_SGST" | "IGST";
  ruleVersion?: string;
};

export type TaxLineResult = {
  lineGross: number;
  lineDiscount: number;
  taxableValue: number;
  taxRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type DocumentTaxResult = {
  lines: TaxLineResult[];
  subtotal: number;
  discountAmount: number;
  taxable: number;
  freightAmount: number;
  freightTaxAmount: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstSplit: "CGST_SGST" | "IGST" | "NONE";
  grandTotal: number;
  ruleVersion: string;
  sellerStateCode: string;
  placeOfSupplyCode: string;
};

export function resolveGstSplitByCodes(
  withGst: boolean,
  sellerStateCode: string,
  placeOfSupplyCode: string,
  gstMode: "AUTO" | "CGST_SGST" | "IGST" = "AUTO"
): "CGST_SGST" | "IGST" | "NONE" {
  if (!withGst) return "NONE";
  if (gstMode === "CGST_SGST") return "CGST_SGST";
  if (gstMode === "IGST") return "IGST";
  const seller = getStateCode(sellerStateCode);
  const pos = getStateCode(placeOfSupplyCode);
  if (!seller || !pos) {
    throw new Error("sellerStateCode and placeOfSupplyCode are required for GST determination");
  }
  return seller === pos ? "CGST_SGST" : "IGST";
}

/** Alias for callers expecting state-code naming. */
export const resolveGstSplitByStateCode = resolveGstSplitByCodes;

/**
 * Deterministic GST engine for MVP domestic goods.
 * Header discount is allocated proportionally to line gross after line discounts.
 */
export function calculateDocumentTotals(input: DocumentTaxInput): DocumentTaxResult {
  const withGst = input.withGst !== false;
  const ruleVersion = input.ruleVersion ?? TAX_RULE_VERSION;
  const sellerStateCode = getStateCode(input.sellerStateCode) ?? input.sellerStateCode;
  const placeOfSupplyCode = getStateCode(input.placeOfSupplyCode) ?? input.placeOfSupplyCode;

  const split = resolveGstSplitByCodes(
    withGst,
    sellerStateCode,
    placeOfSupplyCode,
    input.gstMode ?? "AUTO"
  );

  const baseLines = input.lines.map((l) => {
    const lineGross = round2(Number(l.qty) * Number(l.unitPrice));
    const lineDiscount = round2(Math.min(lineGross, Number(l.discountAmount ?? 0)));
    return { lineGross, lineDiscount, taxRate: Number(l.taxRate) };
  });

  const grossAfterLineDisc = round2(
    baseLines.reduce((s, l) => s + Math.max(0, l.lineGross - l.lineDiscount), 0)
  );
  let headerDiscount = round2(
    Math.max(0, Number(input.headerDiscountAmount ?? input.discountAmount ?? 0))
  );
  if (headerDiscount <= 0 && input.discountPercent && input.discountPercent > 0) {
    headerDiscount = round2((grossAfterLineDisc * Number(input.discountPercent)) / 100);
  }
  headerDiscount = round2(Math.min(grossAfterLineDisc, headerDiscount));

  const lines: TaxLineResult[] = baseLines.map((l) => {
    const afterLine = Math.max(0, l.lineGross - l.lineDiscount);
    const share = grossAfterLineDisc > 0 ? afterLine / grossAfterLineDisc : 0;
    const allocatedHeader = round2(headerDiscount * share);
    const taxableValue = round2(Math.max(0, afterLine - allocatedHeader));
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let taxAmount = 0;
    if (split !== "NONE") {
      taxAmount = round2((taxableValue * l.taxRate) / 100);
      if (split === "CGST_SGST") {
        cgst = round2(taxAmount / 2);
        sgst = round2(taxAmount - cgst);
      } else {
        igst = taxAmount;
      }
    }
    return {
      lineGross: l.lineGross,
      lineDiscount: round2(l.lineDiscount + allocatedHeader),
      taxableValue,
      taxRate: l.taxRate,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      taxAmount,
      lineTotal: round2(taxableValue + taxAmount),
    };
  });

  // Fix leftover header discount paise on last line if needed
  const allocated = round2(lines.reduce((s, l) => s + l.lineDiscount, 0) - baseLines.reduce((s, l) => s + l.lineDiscount, 0));
  const headerDiff = round2(headerDiscount - allocated);
  if (headerDiff !== 0 && lines.length > 0) {
    const last = lines[lines.length - 1];
    last.lineDiscount = round2(last.lineDiscount + headerDiff);
    last.taxableValue = round2(Math.max(0, last.taxableValue - headerDiff));
    if (split !== "NONE") {
      last.taxAmount = round2((last.taxableValue * last.taxRate) / 100);
      if (split === "CGST_SGST") {
        last.cgstAmount = round2(last.taxAmount / 2);
        last.sgstAmount = round2(last.taxAmount - last.cgstAmount);
        last.igstAmount = 0;
      } else {
        last.igstAmount = last.taxAmount;
        last.cgstAmount = 0;
        last.sgstAmount = 0;
      }
      last.lineTotal = round2(last.taxableValue + last.taxAmount);
    } else {
      last.lineTotal = last.taxableValue;
    }
  }

  const freightAmount = round2(Math.max(0, Number(input.freightAmount ?? 0)));
  const freightTaxable = input.freightTaxable !== false;
  const freightTaxRate = Number(input.freightTaxRate ?? 18);
  let freightTaxAmount = 0;
  let freightCgst = 0;
  let freightSgst = 0;
  let freightIgst = 0;
  if (freightAmount > 0 && freightTaxable && split !== "NONE") {
    freightTaxAmount = round2((freightAmount * freightTaxRate) / 100);
    if (split === "CGST_SGST") {
      freightCgst = round2(freightTaxAmount / 2);
      freightSgst = round2(freightTaxAmount - freightCgst);
    } else {
      freightIgst = freightTaxAmount;
    }
  }

  const subtotal = round2(baseLines.reduce((s, l) => s + l.lineGross, 0));
  const discountAmount = round2(
    baseLines.reduce((s, l) => s + l.lineDiscount, 0) + headerDiscount
  );
  const taxable = round2(lines.reduce((s, l) => s + l.taxableValue, 0) + (freightTaxable ? freightAmount : 0));
  const cgstAmount = round2(lines.reduce((s, l) => s + l.cgstAmount, 0) + freightCgst);
  const sgstAmount = round2(lines.reduce((s, l) => s + l.sgstAmount, 0) + freightSgst);
  const igstAmount = round2(lines.reduce((s, l) => s + l.igstAmount, 0) + freightIgst);
  const gstAmount = round2(cgstAmount + sgstAmount + igstAmount);
  const grandTotal = round2(
    lines.reduce((s, l) => s + l.taxableValue, 0) + freightAmount + gstAmount
  );

  return {
    lines,
    subtotal,
    discountAmount,
    taxable,
    freightAmount,
    freightTaxAmount,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstSplit: split,
    grandTotal,
    ruleVersion,
    sellerStateCode,
    placeOfSupplyCode,
  };
}
