"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import { lineSubtotal } from "@/lib/quote-discount";
import {
  applyMarkupPercentToLines,
  clampMarkupPercent,
  costSubtotal,
  headerMarkupAmount,
  lineHasCost,
  type MarkupLine,
} from "@/lib/quote-markup";
import { formatPercentInput, sanitizePercentDraft } from "@/lib/percent-input";

type Props = {
  percent: number;
  lines: MarkupLine[];
  hasExistingMarkup?: boolean;
  onPercentChange: (percent: number) => void;
  onCancel: () => void;
  onApply: (opts: { allowSellFallback: boolean }) => void;
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
  const [focused, setFocused] = useState(false);
  const [allowSellFallback, setAllowSellFallback] = useState(false);
  const [seenPercent, setSeenPercent] = useState(percent);
  if (!focused && percent !== seenPercent) {
    setSeenPercent(percent);
    setPercentText(formatPercentInput(percent));
  }

  const missingCost = lines.filter((line) => !lineHasCost(line)).length;
  const withCost = lines.length - missingCost;
  const pricedForPreview = allowSellFallback
    ? lines.map((line) =>
        lineHasCost(line) ? line : { ...line, costPrice: line.unitPrice }
      )
    : lines;
  const base = costSubtotal(pricedForPreview);
  const amount = headerMarkupAmount(base, percent);
  const marked = applyMarkupPercentToLines(lines, percent, {
    allowSellFallback,
  });
  const sellSubtotal = lineSubtotal(marked);
  const clearing = !(percent > 0);
  const blocked =
    !clearing && withCost === 0 && !allowSellFallback;

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
            type="text"
            inputMode="decimal"
            value={percentText}
            onFocus={() => setFocused(true)}
            onChange={(e) => {
              const raw = sanitizePercentDraft(e.target.value);
              setPercentText(raw);
              if (raw.trim() === "" || raw === ".") {
                onPercentChange(0);
                return;
              }
              const next = Number(raw);
              if (Number.isFinite(next)) {
                onPercentChange(clampMarkupPercent(next));
              }
            }}
            onBlur={() => {
              setFocused(false);
              commitPercentText(percentText);
            }}
            className="h-9 w-28 rounded-lg border border-light-green/40 bg-white/60 px-3 text-right tabular-nums outline-none focus:border-mid-green"
          />
        </label>

        <div className="mt-4 rounded-xl border border-light-green/40 bg-light-green/10 px-4 py-3 text-sm">
          <div className="flex justify-between gap-3 text-mid-green">
            <span>{allowSellFallback && missingCost > 0 ? "Base subtotal" : "Cost subtotal"}</span>
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
          Markup is (sell − cost) / cost. Margin on each line is (sell − cost) /
          sell. Cost stays internal — only sell prices appear on the PDF.
          {missingCost > 0
            ? ` ${missingCost} line${missingCost === 1 ? "" : "s"} have no cost and are not marked up unless you choose to use the sell price.`
            : ""}
        </p>
        {missingCost > 0 ? (
          <label className="mt-3 flex items-start gap-2 text-xs text-dark-primary">
            <input
              type="checkbox"
              checked={allowSellFallback}
              onChange={(e) => setAllowSellFallback(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Use the current sell price as the base where cost is missing. This
              is not procurement cost.
            </span>
          </label>
        ) : null}
        {blocked ? (
          <p className="mt-2 text-xs text-red-700" role="alert">
            No vendor cost on these lines. Enter a cost, or tick the option to
            use sell price as the base.
          </p>
        ) : null}

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
            onClick={() => onApply({ allowSellFallback })}
            disabled={blocked}
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

