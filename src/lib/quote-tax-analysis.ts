import { round2 } from "@/lib/accounting/money";
import { effectiveUnitPrice } from "@/lib/quote-discount";
import {
  formatTaxAnalysis,
  type QuoteGstSplitLabel,
} from "@/lib/quote-format";
import type { QuoteCalcResult } from "@/lib/tax";

export type QuoteTaxAnalysisLine = {
  qty: number;
  unitPrice: number;
  taxRate: number;
  discountPercent?: number;
};

function lineTaxAmount(line: QuoteTaxAnalysisLine, withGst: boolean): number {
  if (!withGst || line.taxRate <= 0) return 0;
  const net = effectiveUnitPrice(line.unitPrice, line.discountPercent);
  const taxable = round2(line.qty * net);
  return round2((taxable * line.taxRate) / 100);
}

/** Preview/PDF tax analysis — uses calculator totals when freight is taxed. */
export function buildQuoteTaxAnalysisInput(input: {
  calc: QuoteCalcResult;
  withGst: boolean;
  lines: QuoteTaxAnalysisLine[];
  discountPercent?: number;
  otherTaxAmount?: number;
  otherTaxLabel?: string;
}) {
  const freightTaxed = input.withGst && input.calc.deliveryCharge > 0;

  if (freightTaxed) {
    return {
      taxable: input.calc.taxable,
      withGst: input.withGst,
      gstBuckets: [] as Array<[number, number]>,
      gstAmount: input.calc.gstAmount,
      discountAmount: input.calc.discountAmount,
      discountPercent: input.discountPercent,
      deliveryCharge: input.calc.deliveryCharge,
      otherTaxAmount: input.calc.otherTaxAmount,
      otherTaxLabel: input.otherTaxLabel,
      gstSplit: input.calc.gstSplit as QuoteGstSplitLabel,
    };
  }

  const gstBuckets = new Map<number, number>();
  if (input.withGst) {
    for (const line of input.lines) {
      const tax = lineTaxAmount(line, true);
      if (line.taxRate <= 0 || tax <= 0) continue;
      gstBuckets.set(
        line.taxRate,
        round2((gstBuckets.get(line.taxRate) || 0) + tax)
      );
    }
  }

  return {
    taxable: input.calc.taxable,
    withGst: input.withGst,
    gstBuckets: Array.from(gstBuckets.entries()),
    gstAmount: input.calc.gstAmount,
    discountAmount: input.calc.discountAmount,
    discountPercent: input.discountPercent,
    deliveryCharge: input.calc.deliveryCharge,
    otherTaxAmount: input.calc.otherTaxAmount,
    otherTaxLabel: input.otherTaxLabel,
    gstSplit: input.calc.gstSplit as QuoteGstSplitLabel,
  };
}

export function formatQuoteTaxAnalysis(
  input: Parameters<typeof buildQuoteTaxAnalysisInput>[0]
): string {
  return formatTaxAnalysis(buildQuoteTaxAnalysisInput(input));
}