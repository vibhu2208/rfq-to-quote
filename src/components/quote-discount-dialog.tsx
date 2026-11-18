"use client";

import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import { formatMoney } from "@/lib/tax";
import {
  clampDiscountPercent,
  headerDiscountAmount,
  previewDiscountedSubtotal,
  validateDiscountApplication,
  type QuoteDiscountMethod,
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
  hasExistingDiscount?: boolean;
  onPercentChange: (percent: number) => void;
  onMethodsChange: (methods: QuoteDiscountMethods) => void;
  onCancel: () => void;
  onApply: () => void;
  onClearAll?: () => void;
};

export function QuoteDiscountDialog({
  percent,
  lines,
  methods,
  hasExistingDiscount = false,
  onPercentChange,
  onMethodsChange,
  onCancel,
  onApply,
  onClearAll,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [percentText, setPercentText] = useState(formatPercentInput(percent));

  useEffect(() => {
    if (!focused) setPercentText(formatPercentInput(percent));
  }, [percent, focused]);

  const listSubtotal = previewDiscountedSubtotal(lines, 0, {
    method: "header",
  });
  const finalSubtotal = previewDiscountedSubtotal(lines, percent, methods);
  const headerAmount = headerDiscountAmount(listSubtotal, percent);
  const lineSubtotalAfter = previewDiscountedSubtotal(lines, percent, {
    method: "lines",
  });
  const clearing = !(percent > 0);
  const validation = validateDiscountApplication({
    percent,
    methods,
    lines,
  });
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
              Choose one discount type — whole quote or per product, not both.
              Current subtotal {formatMoney(listSubtotal)}. Set % to 0 to remove.
            </p>
          </div>
        </div>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-mid-green">Discount %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="numeric"
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
                Keep product list prices. Show {displayPercent(percent)}% (
                {formatMoney(headerAmount)}) as a single discount line on the
                quotation.
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

        {percent > 0 ? (
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

/** Empty while zero so typing `9` never becomes `09`. */
function formatPercentInput(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) return "";
  // Strip float noise / leading zeros (9 not 09, 10 not 10.00).
  const rounded = Math.round(percent * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function displayPercent(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? rounded : rounded;
}

/** Keep digits (and one optional decimal); drop leading zeros like 09 → 9. */
function sanitizePercentDraft(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (cleaned === "") return "";
  const dot = cleaned.indexOf(".");
  if (dot === -1) {
    return String(Number(cleaned));
  }
  const whole = cleaned.slice(0, dot);
  const frac = cleaned.slice(dot + 1).replace(/\./g, "");
  const wholeNorm = whole === "" ? "0" : String(Number(whole));
  // Preserve trailing dot while typing 9. → "9."
  if (cleaned.endsWith(".") && frac === "") return `${wholeNorm}.`;
  return `${wholeNorm}.${frac}`;
}
