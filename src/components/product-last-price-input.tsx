"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { History, X } from "lucide-react";
import { Money } from "@/components/ui";

type PriceHistoryItem = {
  quoteId: string;
  quoteNumber: string;
  clientName: string;
  unitPrice: number;
  quotedAt: string;
  status: string;
};

type PriceHistoryResponse = {
  productId: string;
  code: string;
  name: string;
  lastPrice: number | null;
  lastPricedAt: string | null;
  offerPrice: number;
  history: PriceHistoryItem[];
};

export function ProductLastPriceInput({
  productId,
  value,
  onSaved,
}: {
  productId: string;
  value: number;
  onSaved: (price: number) => void;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
  }, [productId, value]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError("");
    void fetch(`/api/products/${productId}/last-price`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setHistoryError(
            typeof data.error === "string" ? data.error : "Could not load history"
          );
          setHistory(null);
          return;
        }
        setHistory(data as PriceHistoryResponse);
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryError("Could not load history");
          setHistory(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  async function savePrice(next: number) {
    if (!Number.isFinite(next) || next < 0) {
      setError("Invalid");
      setDraft(value > 0 ? String(value) : "");
      return false;
    }
    if (Math.round(next * 100) / 100 === Math.round((value || 0) * 100) / 100) {
      setError("");
      return true;
    }

    setSaving(true);
    setError("");
    const res = await fetch(`/api/products/${productId}/last-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: next }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Save failed");
      setDraft(value > 0 ? String(value) : "");
      return false;
    }
    const saved = Number(data.lastPrice ?? next);
    setDraft(String(saved));
    onSaved(saved);
    return true;
  }

  async function commit() {
    const next = Number(draft);
    await savePrice(next);
  }

  async function selectHistoryPrice(price: number) {
    const ok = await savePrice(price);
    if (ok) setOpen(false);
  }

  const latestClient = history?.history[0] || null;

  return (
    <span className="inline-flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
      <span className="inline-flex items-center gap-0.5">
        <span className="text-xs text-mid-green">₹</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft}
          disabled={saving}
          aria-label="Last price"
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="w-[6.5rem] rounded-md border border-light-green/40 bg-white/80 px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-dark-primary outline-none focus:border-mid-green disabled:opacity-60"
        />
      </span>
      {saving ? (
        <span className="text-[10px] font-normal text-mid-green">Saving…</span>
      ) : error ? (
        <span className="text-[10px] font-normal text-dark-primary">{error}</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex max-w-[9rem] items-center gap-1 text-[10px] font-normal text-mid-green hover:text-dark-primary"
          title="Price history"
          aria-label="Open price history"
        >
          <History className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">
            {latestClient ? latestClient.clientName : "History"}
          </span>
        </button>
      )}

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-dark-primary/50 p-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`price-history-${productId}`}
              onClick={() => setOpen(false)}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-light-green/30 bg-white shadow-[0_24px_80px_rgba(11,43,38,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex items-start justify-between gap-3 border-b border-light-green/20 px-4 py-3.5">
                  <div className="min-w-0">
                    <h3
                      id={`price-history-${productId}`}
                      className="text-base font-semibold tracking-tight text-dark-primary"
                    >
                      Price history
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-mid-green">
                      {history?.code || "…"} — {history?.name || "Loading product"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-mid-green hover:bg-dark-secondary/8"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <div className="rounded-xl bg-light-green/15 px-3 py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                      Current last price
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-dark-primary">
                      {value > 0 ? <Money value={value} /> : "—"}
                    </p>
                    {history?.lastPricedAt ? (
                      <p className="mt-0.5 text-[11px] text-mid-green">
                        Updated {format(new Date(history.lastPricedAt), "dd MMM yyyy")}
                      </p>
                    ) : null}
                  </div>

                  <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-mid-green">
                    Previous quotes (up to 4)
                  </p>

                  {loadingHistory ? (
                    <p className="mt-3 text-sm text-mid-green">Loading history…</p>
                  ) : historyError ? (
                    <p className="mt-3 text-sm text-dark-primary">{historyError}</p>
                  ) : !history || history.history.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-light-green/40 px-3 py-6 text-center text-sm text-mid-green">
                      No previous quoted prices for this product yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {history.history.map((row) => {
                        const selected =
                          Math.round(row.unitPrice * 100) ===
                          Math.round((value || 0) * 100);
                        return (
                          <li key={row.quoteId}>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void selectHistoryPrice(row.unitPrice)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                                selected
                                  ? "border-mid-green/40 bg-mid-green/15"
                                  : "border-light-green/25 bg-white hover:border-mid-green/30 hover:bg-light-green/10"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-dark-primary">
                                  {row.clientName}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-mid-green">
                                  {row.quoteNumber} ·{" "}
                                  {format(new Date(row.quotedAt), "dd MMM yyyy")} ·{" "}
                                  {row.status.replaceAll("_", " ").toLowerCase()}
                                </span>
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-dark-primary">
                                <Money value={row.unitPrice} />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <footer className="border-t border-light-green/20 px-4 py-3 text-[11px] text-mid-green">
                  Tap a past quote to use that sell price as the last price.
                </footer>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
