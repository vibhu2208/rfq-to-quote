"use client";

import { Percent } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import {
  applyPercentToLinePrices,
  headerDiscountAmount,
  lineSubtotal,
  type QuoteDiscountMethod,
} from "@/lib/quote-discount";

type PricedLine = {
  qty: number;
  unitPrice: number;
};

type Props = {
  percent: number;
  lines: PricedLine[];
  method: QuoteDiscountMethod;
  onPercentChange: (percent: number) => void;
  onMethodChange: (method: QuoteDiscountMethod) => void;
  onCancel: () => void;
  onApply: () => void;
};

export function QuoteDiscountDialog({
  percent,
  lines,
  method,
  onPercentChange,
  onMethodChange,
  onCancel,
  onApply,
}: Props) {
  const subtotal = lineSubtotal(lines);
  const amount = headerDiscountAmount(subtotal, percent);
  const reducedSubtotal = lineSubtotal(applyPercentToLinePrices(lines, percent));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-method-title"
        className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-mid-green/15 text-mid-green">
            <Percent className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <h2 id="discount-method-title" className="text-lg font-semibold">
              Apply client discount
            </h2>
            <p className="mt-1 text-sm text-mid-green">
              Choose how {percent || 0}% off the current subtotal of{" "}
              {formatMoney(subtotal)} should appear on the revised quote.
            </p>
          </div>
        </div>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-mid-green">Discount %</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => onPercentChange(Number(e.target.value))}
            className="h-9 w-28 rounded-lg border border-light-green/40 bg-white/60 px-3 text-right tabular-nums outline-none focus:border-mid-green"
          />
        </label>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onMethodChange("header")}
            aria-pressed={method === "header"}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              method === "header"
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <span className="block text-sm font-semibold text-dark-primary">
              Direct discount on the quote
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-mid-green">
              Keep product prices. Mention {percent || 0}% ({formatMoney(amount)}) as
              a discount line on the quotation.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onMethodChange("lines")}
            aria-pressed={method === "lines"}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              method === "lines"
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <span className="block text-sm font-semibold text-dark-primary">
              Reduce each product price
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-mid-green">
              Lower every unit price so the subtotal becomes {formatMoney(reducedSubtotal)}{" "}
              — {percent || 0}% off, with no discount line on the quote.
            </span>
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-light-green/50 px-3 py-2 text-sm hover:bg-light-green/20"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            {percent > 0 ? "Apply discount" : "Remove discount"}
          </button>
        </div>
      </div>
    </div>
  );
}
