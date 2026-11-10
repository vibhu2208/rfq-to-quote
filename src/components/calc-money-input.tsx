"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { round2 } from "@/lib/accounting/money";
import {
  evaluateMoneyFieldExpression,
  formatCalcNumber,
  looksLikeMoneyExpression,
} from "@/lib/quote-calculator";

type Props = {
  value: number;
  onCommit: (value: number) => void;
  /** Called when the typed value exceeds `max` (after clamping). */
  onRangeError?: (message: string) => void;
  className?: string;
  title?: string;
  min?: number;
  max?: number;
  "aria-label"?: string;
};

function displayValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return formatCalcNumber(round2(Math.max(0, value)));
}

export function CalcMoneyInput({
  value,
  onCommit,
  onRangeError,
  className,
  title,
  min = 0,
  max,
  "aria-label": ariaLabel,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(displayValue(value));

  useEffect(() => {
    if (!focused) setText(displayValue(value));
  }, [value, focused]);

  function commitNumber(next: number) {
    let clamped = round2(Math.max(min, next));
    if (typeof max === "number" && Number.isFinite(max) && clamped > max) {
      clamped = round2(max);
      onRangeError?.(
        `Max value is ${max.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      );
    }
    onCommit(clamped);
    setText(displayValue(clamped));
  }

  function tryEvaluate(raw: string): boolean {
    const result = evaluateMoneyFieldExpression(raw);
    if (!result.ok) return false;
    commitNumber(result.value);
    return true;
  }

  function finishEdit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      commitNumber(0);
      return;
    }
    if (tryEvaluate(trimmed)) return;
    const plain = Number(trimmed.replace(/,/g, ""));
    if (Number.isFinite(plain)) {
      commitNumber(plain);
      return;
    }
    setText(displayValue(value));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "=" && e.key !== "Enter") return;
    e.preventDefault();
    const raw = e.key === "=" ? text : text;
    if (!tryEvaluate(raw)) {
      // Keep the draft so the trader can fix a bad expression.
      if (!looksLikeMoneyExpression(raw)) finishEdit(raw);
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={focused ? text : displayValue(value)}
      onFocus={(e) => {
        setFocused(true);
        setText(displayValue(value));
        e.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        finishEdit(text);
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      className={className}
      title={
        title
          ? `${title} · type 4+4 or 400+18% then =`
          : "Type 4+4 or 400+18% then press ="
      }
      aria-label={ariaLabel}
    />
  );
}
