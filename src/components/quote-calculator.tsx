"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Calculator, Check, Copy, Delete, X } from "lucide-react";
import {
  applyGst,
  calculatorShortcutLabel,
  evaluateExpression,
  formatCalcNumber,
  isCalculatorToggle,
  removeGst,
  seedFromFocusedField,
} from "@/lib/quote-calculator";

const GST_RATES = [5, 12, 18, 28];

const KEYS: { label: string; insert?: string; action?: "clear" | "back" | "eq"; wide?: boolean }[] =
  [
    { label: "C", action: "clear" },
    { label: "⌫", action: "back" },
    { label: "%", insert: "%" },
    { label: "÷", insert: "÷" },
    { label: "7", insert: "7" },
    { label: "8", insert: "8" },
    { label: "9", insert: "9" },
    { label: "×", insert: "×" },
    { label: "4", insert: "4" },
    { label: "5", insert: "5" },
    { label: "6", insert: "6" },
    { label: "−", insert: "−" },
    { label: "1", insert: "1" },
    { label: "2", insert: "2" },
    { label: "3", insert: "3" },
    { label: "+", insert: "+" },
    { label: "0", insert: "0", wide: true },
    { label: ".", insert: "." },
    { label: "=", action: "eq" },
  ];

type Props = {
  compact?: boolean;
  className?: string;
};

export function QuoteCalculator({ compact = false, className }: Props) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expr, setExpr] = useState("");
  const [error, setError] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gstRate, setGstRate] = useState(18);
  const [history, setHistory] = useState<number[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [shortcut, setShortcut] = useState("Alt+C");
  const macRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    macRef.current = /Mac|iPhone|iPad/i.test(navigator.platform);
    setShortcut(calculatorShortcutLabel(navigator.platform));
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const runEquals = useCallback(() => {
    const result = evaluateExpression(expr);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExpr(formatCalcNumber(result.value));
    setError("");
    setJustEvaluated(true);
    setHistory((prev) => [result.value, ...prev.filter((n) => n !== result.value)].slice(0, 4));
  }, [expr]);

  const insert = useCallback(
    (chunk: string) => {
      setError("");
      setCopied(false);
      setExpr((current) => {
        if (justEvaluated && /[0-9.]/.test(chunk)) return chunk;
        return current + chunk;
      });
      setJustEvaluated(false);
    },
    [justEvaluated]
  );

  const backspace = useCallback(() => {
    setError("");
    setJustEvaluated(false);
    setExpr((current) => current.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    setExpr("");
    setError("");
    setJustEvaluated(false);
    setCopied(false);
  }, []);

  const currentValue = useCallback(() => {
    if (justEvaluated) {
      const parsed = evaluateExpression(expr);
      if (parsed.ok) return parsed;
    }
    return evaluateExpression(expr);
  }, [expr, justEvaluated]);

  const applyGstOp = useCallback(
    (mode: "add" | "remove") => {
      const current = currentValue();
      if (!current.ok) {
        setError(current.error);
        return;
      }
      const next = mode === "add" ? applyGst(current.value, gstRate) : removeGst(current.value, gstRate);
      if (!next.ok) {
        setError(next.error);
        return;
      }
      setExpr(formatCalcNumber(next.value));
      setError("");
      setJustEvaluated(true);
      setHistory((prev) => [next.value, ...prev.filter((n) => n !== next.value)].slice(0, 4));
    },
    [currentValue, gstRate]
  );

  const copyResult = useCallback(async () => {
    const current = currentValue();
    if (!current.ok) {
      setError(current.error);
      return;
    }
    const text = formatCalcNumber(current.value);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Could not copy");
    }
  }, [currentValue]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (isCalculatorToggle(e, { requireMod: macRef.current })) {
        e.preventDefault();
        setOpen((value) => {
          if (!value) {
            const seed = seedFromFocusedField();
            if (seed) {
              setExpr(seed);
              setJustEvaluated(true);
              setError("");
            }
          }
          return !value;
        });
        return;
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  function onHeaderPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    function move(ev: PointerEvent) {
      const x = Math.min(window.innerWidth - width - 8, Math.max(8, ev.clientX - dx));
      const y = Math.min(window.innerHeight - 48, Math.max(8, ev.clientY - dy));
      setPos({ x, y });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const triggerClass = compact
    ? className
    : `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-light-green/35 bg-white px-3 text-sm font-medium text-dark-secondary hover:bg-light-green/15 ${className ?? ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={triggerClass}
        title={`Calculator (${shortcut})`}
        aria-label="Calculator"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
      >
        <Calculator className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.5} />
        {compact ? null : (
          <>
            Calculator
            <kbd className="rounded bg-light-green/25 px-1.5 py-0.5 text-[10px] font-medium text-mid-green">
              {shortcut}
            </kbd>
          </>
        )}
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              style={
                pos
                  ? { left: pos.x, top: pos.y }
                  : { right: 20, bottom: 72 }
              }
              className="fixed z-[80] w-[17.5rem] rounded-xl border border-light-green/30 bg-background shadow-[0_12px_40px_rgba(11,43,38,0.18)]"
            >
              <div
                onPointerDown={onHeaderPointerDown}
                className="flex cursor-grab items-center gap-2 border-b border-light-green/20 px-3 py-2 active:cursor-grabbing"
              >
                <Calculator className="h-3.5 w-3.5 text-mid-green" strokeWidth={1.5} />
                <h2 id={titleId} className="text-sm font-semibold text-dark-primary">
                  Calculator
                </h2>
                <span className="text-[10px] text-mid-green">{shortcut}</span>
                <button
                  type="button"
                  onClick={close}
                  className="ml-auto rounded-md p-1 text-mid-green hover:bg-light-green/20"
                  aria-label="Close calculator"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>

              <div className="space-y-2 p-3">
                <input
                  ref={inputRef}
                  value={expr}
                  onChange={(e) => {
                    setExpr(e.target.value);
                    setJustEvaluated(false);
                    setError("");
                    setCopied(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runEquals();
                    }
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="450 × 12 × 1.18"
                  aria-label="Calculation"
                  className="h-10 w-full rounded-lg border border-light-green/35 bg-white px-2.5 text-right text-lg font-semibold tabular-nums outline-none placeholder:text-sm placeholder:font-normal placeholder:text-mid-green/50 focus:border-mid-green"
                />
                {error ? <p className="text-right text-[11px] text-dark-primary">{error}</p> : null}

                <div className="grid grid-cols-4 gap-1.5">
                  {KEYS.map((key) => {
                    const op = key.insert === "÷" || key.insert === "×" || key.insert === "−" || key.insert === "+";
                    const isEq = key.action === "eq";
                    return (
                      <button
                        key={key.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (key.action === "clear") clearAll();
                          else if (key.action === "back") backspace();
                          else if (key.action === "eq") runEquals();
                          else if (key.insert) insert(key.insert);
                        }}
                        className={`h-9 rounded-md text-sm font-medium tabular-nums transition ${
                          key.wide ? "col-span-2" : ""
                        } ${
                          isEq
                            ? "bg-mid-green text-background hover:bg-dark-secondary"
                            : op
                              ? "bg-light-green/30 text-dark-secondary hover:bg-light-green/45"
                              : key.action
                                ? "bg-white text-dark-secondary hover:bg-light-green/20"
                                : "bg-white text-dark-primary hover:bg-light-green/20"
                        }`}
                        aria-label={
                          key.action === "back"
                            ? "Backspace"
                            : key.action === "clear"
                              ? "Clear"
                              : key.action === "eq"
                                ? "Equals"
                                : key.label
                        }
                      >
                        {key.action === "back" ? (
                          <Delete className="mx-auto h-4 w-4" strokeWidth={1.5} />
                        ) : (
                          key.label
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    aria-label="GST rate"
                    className="h-8 rounded-md border border-light-green/35 bg-white px-1.5 text-xs outline-none focus:border-mid-green"
                  >
                    {GST_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        GST {rate}%
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyGstOp("add")}
                    className="h-8 flex-1 rounded-md border border-light-green/35 bg-white text-xs font-medium hover:bg-light-green/15"
                    title={`Add ${gstRate}% GST`}
                  >
                    +GST
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyGstOp("remove")}
                    className="h-8 flex-1 rounded-md border border-light-green/35 bg-white text-xs font-medium hover:bg-light-green/15"
                    title={`Remove ${gstRate}% GST`}
                  >
                    −GST
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyResult()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-light-green/35 bg-white text-mid-green hover:bg-light-green/15"
                    title="Copy result"
                    aria-label="Copy result"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                    ) : (
                      <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                </div>

                {history.length ? (
                  <div className="flex flex-wrap gap-1">
                    {history.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setExpr(formatCalcNumber(value));
                          setJustEvaluated(true);
                          setError("");
                        }}
                        className="rounded-full bg-light-green/20 px-2 py-0.5 text-[11px] tabular-nums text-dark-secondary hover:bg-light-green/35"
                      >
                        {formatCalcNumber(value)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-mid-green">
                    Type an amount, qty × rate, or GST. Result copies with one click.
                  </p>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
