"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import { lineSubtotal } from "@/lib/quote-discount";
import {
  applyMarkupPercentToLines,
  clampMarkupPercent,
  costSubtotal,
  headerMarkupAmount,
  type MarkupLine,
} from "@/lib/quote-markup";

type Props = {
  percent: number;
  lines: MarkupLine[];
  hasExistingMarkup?: boolean;
  onPercentChange: (percent: number) => void;
  onCancel: () => void;
  onApply: () => void;
  onClear?: () => void;
};

export function QuoteMarkupDialog({
  percent,
  lines,
  hasExistingMarkup = false,
  onPercentChange,
  onCancel,
  onApply,
  onClear,
}: Props) {
  const [percentText, setPercentText] = useState(formatPercentInput(percent));

  useEffect(() => {
    setPercentText(formatPercentInput(percent));
  }, [percent]);

  const base = costSubtotal(lines);
  const amount = headerMarkupAmount(base, percent);
  const marked = applyMarkupPercentToLines(lines, percent);
  const sellSubtotal = lineSubtotal(marked);
  const withCost = lines.filter(
    (line) => line.costPrice != null && Number(line.costPrice) > 0
  ).length;
  const clearing = !(percent > 0);

  function commitPercentText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onPercentChange(0);
      setPercentText("");
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next)) {
      setPercentText(formatPercentInput(percent));
      return;
    }
    const clamped = clampMarkupPercent(next);
    onPercentChange(clamped);
    setPercentText(formatPercentInput(clamped));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-dark-primary/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="markup-dialog-title"
        className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-mid-green/15 text-mid-green">
            <TrendingUp className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <h2 id="markup-dialog-title" className="text-lg font-semibold">
              {hasExistingMarkup ? "Edit trader markup" : "Apply trader markup"}
            </h2>
            <p className="mt-1 text-sm text-mid-green">
              Raise sell prices from vendor cost
              {withCost > 0
                ? ` (${withCost} line${withCost === 1 ? "" : "s"} with cost)`
                : ""}
              . Marked-up amounts become the unit prices on the quotation.
              {hasExistingMarkup
                ? " Clear restores sell prices to the cost base."
                : ""}
            </p>
          </div>
        </div>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-mid-green">Markup %</span>
          <input
            type="number"
            min={0}
            max={1000}
            step="0.01"
            value={percentText}
            onChange={(e) => {
              const raw = e.target.value;
              setPercentText(raw);
              if (raw.trim() === "") {
                onPercentChange(0);
                return;
              }
              const next = Number(raw);
              if (Number.isFinite(next)) {
                onPercentChange(clampMarkupPercent(next));
              }
            }}
            onBlur={() => commitPercentText(percentText)}
            className="h-9 w-28 rounded-lg border border-light-green/40 bg-white/60 px-3 text-right tabular-nums outline-none focus:border-mid-green"
          />
        </label>

        <div className="mt-4 rounded-xl border border-light-green/40 bg-light-green/10 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3 text-mid-green">
            <span>Cost / base subtotal</span>
            <span className="tabular-nums font-medium text-dark-primary">
              {formatMoney(base)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-mid-green">
            <span>Markup {percent || 0}%</span>
            <span className="tabular-nums font-medium text-dark-primary">
              +{formatMoney(amount)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between gap-3 border-t border-light-green/30 pt-1.5 font-semibold text-dark-primary">
            <span>Sell subtotal on quote</span>
            <span className="tabular-nums">{formatMoney(sellSubtotal)}</span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-mid-green">
          Lines with a vendor cost use that as the base. Other lines mark up the
          current sell price. Cost stays internal — only sell prices appear on the
          PDF.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {hasExistingMarkup && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="mr-auto rounded-lg border border-light-green/50 px-3 py-2 text-sm text-mid-green hover:bg-light-green/20"
            >
              Clear markup
            </button>
          ) : null}
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
            {clearing
              ? "Clear markup"
              : hasExistingMarkup
                ? "Update markup"
                : "Apply markup"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPercentInput(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) return "";
  return String(percent);
}
