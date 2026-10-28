"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
  }, [productId, value]);

  async function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0) {
      setError("Invalid");
      setDraft(value > 0 ? String(value) : "");
      return;
    }
    if (Math.round(next * 100) / 100 === Math.round((value || 0) * 100) / 100) {
      setError("");
      return;
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
      return;
    }
    onSaved(Number(data.lastPrice ?? next));
  }

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
        <span className="text-[10px] font-normal text-mid-green">Last price</span>
      )}
    </span>
  );
}
