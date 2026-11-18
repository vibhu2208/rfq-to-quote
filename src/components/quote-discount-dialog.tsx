"use client";

import { useState } from "react";
import { Percent } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import {
  clampDiscountPercent,
  grossLineSubtotal,
  headerDiscountAmount,
  previewDiscountedSubtotal,
  validateDiscountApplication,
  validateFixedDiscountAmount,
  type QuoteDiscountMethod,
  type QuoteDiscountMethods,
} from "@/lib/quote-discount";
import { formatPercentInput, sanitizePercentDraft } from "@/lib/percent-input";

type PricedLine = {
  qty: number;
  unitPrice: number;
  discountPercent?: number;
};

type Props = {
  percent: number;
  /** Whole-quote fixed rupee amount. Mutually exclusive with percent. */
  amount?: number;
  amountMode?: boolean;
  lines: PricedLine[];
  methods: QuoteDiscountMethods;
  hasExistingDiscount?: boolean;
  /** Subtotal the editor already shows (after discounts). */
  currentSubtotal?: number;
  onPercentChange: (percent: number) => void;
  onAmountChange?: (amount: number) => void;
  onAmountModeChange?: (amountMode: boolean) => void;
  onMethodsChange: (methods: QuoteDiscountMethods) => void;
  onCancel: () => void;
  onApply: () => void;
  onClearAll?: () => void;
};

export function QuoteDiscountDialog({
  percent,
  amount = 0,
  amountMode = false,
  lines,
  methods,
  hasExistingDiscount = false,
  currentSubtotal,
  onPercentChange,
  onAmountChange,
  onAmountModeChange,
  onMethodsChange,
  onCancel,
  onApply,
  onClearAll,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [percentText, setPercentText] = useState(formatPercentInput(percent));
  const [amountText, setAmountText] = useState(amount > 0 ? String(amount) : "");
  const [seenPercent, setSeenPercent] = useState(percent);
  const [seenAmount, setSeenAmount] = useState(amount);
  if (!focused && percent !== seenPercent) {
    setSeenPercent(percent);
    setPercentText(formatPercentInput(percent));
  }
  if (!focused && amount !== seenAmount) {
    setSeenAmount(amount);
    setAmountText(amount > 0 ? String(amount) : "");
  }

  const gross = grossLineSubtotal(lines);
  const shownCurrent = currentSubtotal ?? gross;
  const usingAmount = amountMode && methods.method === "header";
  const finalSubtotal = usingAmount
    ? Math.max(0, Math.round((gross - amount) * 100) / 100)
    : previewDiscountedSubtotal(lines, percent, methods);
  const headerAmount = usingAmount
    ? amount
    : headerDiscountAmount(gross, percent);
  const lineSubtotalAfter = previewDiscountedSubtotal(lines, percent, {
    method: "lines",
  });
  const clearing = usingAmount ? !(amount > 0) : !(percent > 0);
  const percentValidation = validateDiscountApplication({
    percent,
    methods,
    lines,
  });
  const amountValidation = validateFixedDiscountAmount(amount, gross);
  const validation = usingAmount
    ? amount > 0
      ? amountValidation
      : { ok: true as const }
    : percentValidation;
  // Clear only when an applied discount exists; otherwise require a positive %.
  const canApply = clearing
    ? hasExistingDiscount
    : validation.ok && percent > 0;
  const primaryLabel = clearing
    ? hasExistingDiscount
      ? "Clear discount"
      : "Apply discount"
    : hasExistingDiscount
      ? "Update discount"
      : "Apply discount";

  function selectMethod(method: QuoteDiscountMethod) {
    onMethodsChange({ method });
  }

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
    const clamped = clampDiscountPercent(next);
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
              {hasExistingDiscount
                ? "Edit client discount"
                : "Apply client discount"}
            </h2>
            <p className="mt-1 text-sm text-mid-green">
              Choose one discount: a whole-quote percent, a whole-quote rupee
              amount, or a per-product percent. They are not combined.
            </p>
            <p className="mt-2 text-xs text-mid-green">
              {shownCurrent === gross ? (
                <>Subtotal on the quote {formatMoney(gross)} (no discount yet).</>
              ) : (
                <>
                  Gross (before discounts) {formatMoney(gross)}. Discounted
                  subtotal on the quote {formatMoney(shownCurrent)}.
                </>
              )}
            </p>
          </div>
        </div>

        {methods.method === "header" ? (
          <div className="mt-4 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onAmountModeChange?.(false)}
              className={`rounded-full px-3 py-1 ${
                !usingAmount
                  ? "bg-mid-green text-background"
                  : "border border-light-green/40 text-mid-green"
              }`}
            >
              Percent
            </button>
            <button
              type="button"
              onClick={() => onAmountModeChange?.(true)}
              className={`rounded-full px-3 py-1 ${
                usingAmount
                  ? "bg-mid-green text-background"
                  : "border border-light-green/40 text-mid-green"
              }`}
            >
              Fixed ₹
            </button>
          </div>
        ) : null}

        {usingAmount ? (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-mid-green">Discount amount (₹)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountText}
              onFocus={() => setFocused(true)}
              onChange={(e) => {
                const raw = sanitizePercentDraft(e.target.value);
                setAmountText(raw);
                onAmountChange?.(raw.trim() === "" ? 0 : Number(raw) || 0);
              }}
              onBlur={() => setFocused(false)}
              className="h-9 w-36 rounded-lg border border-light-green/40 bg-white/60 px-3 text-right tabular-nums outline-none focus:border-mid-green"
            />
          </label>
        ) : (
        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-mid-green">Discount %</span>
          <input
            type="text"
            inputMode="decimal"
            value={percentText}
            onFocus={() => setFocused(true)}
            onChange={(e) => {
              const raw = sanitizePercentDraft(e.target.value);
              setPercentText(raw);
              if (raw.trim() === "") {
                onPercentChange(0);
                return;
              }
              const next = Number(raw);
              if (!Number.isFinite(next)) return;
              onPercentChange(Math.max(0, next));
            }}
            onBlur={() => {
              setFocused(false);
              commitPercentText(percentText);
            }}
            className="h-9 w-28 rounded-lg border border-light-green/40 bg-white/60 px-3 text-right tabular-nums outline-none focus:border-mid-green"
          />
        </label>
        )}

        <fieldset className="mt-4 grid gap-2">
          <legend className="sr-only">Discount type</legend>
          <label
            className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 text-left transition ${
              methods.method === "header"
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <input
              type="radio"
              name="quote-discount-method"
              checked={methods.method === "header"}
              onChange={() => selectMethod("header")}
              className="mt-1 h-4 w-4 accent-[var(--mid-green,#2f6f64)]"
            />
            <span>
              <span className="block text-sm font-semibold text-dark-primary">
                Whole quote discount
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-mid-green">
                Keep product list prices. Show{" "}
                {usingAmount
                  ? formatMoney(headerAmount)
                  : `${displayPercent(percent)}% (${formatMoney(headerAmount)})`}{" "}
                as a single discount on the quotation.
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 text-left transition ${
              methods.method === "lines"
                ? "border-mid-green bg-mid-green/10"
                : "border-light-green/40 hover:bg-light-green/15"
            }`}
          >
            <input
              type="radio"
              name="quote-discount-method"
              checked={methods.method === "lines"}
              onChange={() => selectMethod("lines")}
              className="mt-1 h-4 w-4 accent-[var(--mid-green,#2f6f64)]"
            />
            <span>
              <span className="block text-sm font-semibold text-dark-primary">
                Per-product discount
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-mid-green">
                Set {displayPercent(percent)}% on every line (editable per
                product after). Sell subtotal becomes{" "}
                {formatMoney(lineSubtotalAfter)}.
              </span>
            </span>
          </label>
        </fieldset>

        {percent > 0 || (usingAmount && amount > 0) ? (
          <p className="mt-3 text-xs text-mid-green">
            After apply: subtotal before tax ≈ {formatMoney(finalSubtotal)}
            {methods.method === "header"
              ? " (list prices − whole-quote discount)."
              : " (line discounts only)."}
          </p>
        ) : null}

        {!validation.ok && validation.reason ? (
          <p className="mt-2 text-xs text-red-700" role="alert">
            {validation.reason}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {hasExistingDiscount && onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="mr-auto rounded-lg border border-light-green/50 px-3 py-2 text-sm text-mid-green hover:bg-light-green/20"
            >
              Remove discount
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
            disabled={!canApply}
            className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function displayPercent(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? rounded : rounded;
}

