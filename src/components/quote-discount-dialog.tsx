"use client";

import { Percent } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import {
  applyPercentToLineDiscounts,
  headerDiscountAmount,
  lineSubtotal,
  type QuoteDiscountMethods,
} from "@/lib/quote-discount";

type PricedLine = {
  qty: number;
  unitPrice: number;
  discountPercent?: number;
};

type Props = {
  percent: number;
  lines: PricedLine[];
  methods: QuoteDiscountMethods;
  onPercentChange: (percent: number) => void;
  onMethodsChange: (methods: QuoteDiscountMethods) => void;
  onCancel: () => void;
  onApply: () => void;
};

export function QuoteDiscountDialog({
  percent,
  lines,
  methods,
  onPercentChange,
  onMethodsChange,
  onCancel,
  onApply,
}: Props) {
  const baseSubtotal = lineSubtotal(
    lines.map((line) => ({ ...line, discountPercent: 0 }))
  );
  const afterLines = lineSubtotal(applyPercentToLineDiscounts(lines, percent));
  const headerOn =
    methods.header && percent > 0
      ? headerDiscountAmount(methods.lines ? afterLines : baseSubtotal, percent)
      : 0;
  const finalSubtotal = roundMoney(
    (methods.lines ? afterLines : baseSubtotal) - headerOn
  );
  const canApply = methods.header || methods.lines;

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
              Use whole-quote discount, per-product discount, or both. Current
              subtotal {formatMoney(baseSubtotal)}.
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
          <label
            className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 text-left transition ${
              methods.header
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <input
              type="checkbox"
              checked={methods.header}
              onChange={(e) =>
                onMethodsChange({ ...methods, header: e.target.checked })
              }
              className="mt-1 h-4 w-4 accent-[var(--mid-green,#2f6f64)]"
            />
            <span>
              <span className="block text-sm font-semibold text-dark-primary">
                Whole quote discount
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-mid-green">
                Keep product list prices. Show {percent || 0}% (
                {formatMoney(
                  headerDiscountAmount(
                    methods.lines ? afterLines : baseSubtotal,
                    percent
                  )
                )}
                ) as a discount line on the quotation.
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 text-left transition ${
              methods.lines
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <input
              type="checkbox"
              checked={methods.lines}
              onChange={(e) =>
                onMethodsChange({ ...methods, lines: e.target.checked })
              }
              className="mt-1 h-4 w-4 accent-[var(--mid-green,#2f6f64)]"
            />
            <span>
              <span className="block text-sm font-semibold text-dark-primary">
                Per-product discount
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-mid-green">
                Set {percent || 0}% on every line (editable per product after).
                Sell subtotal becomes {formatMoney(afterLines)}.
              </span>
            </span>
          </label>
        </div>

        {canApply && percent > 0 ? (
          <p className="mt-3 text-xs text-mid-green">
            After apply: subtotal before tax ≈ {formatMoney(finalSubtotal)}
            {methods.header && methods.lines ? " (products + whole quote)" : ""}.
          </p>
        ) : null}

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
            disabled={!canApply}
            className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
          >
            {percent > 0 ? "Apply discount" : "Clear selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
