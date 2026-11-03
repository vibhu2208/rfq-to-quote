"use client";

import { formatMoney } from "@/lib/tax";

export type CatalogPriceStackValue = {
  lastPrice: number | null;
  offerPrice: number | null;
  mrp: number | null;
};

const ROWS: Array<{ key: keyof CatalogPriceStackValue; label: string }> = [
  { key: "lastPrice", label: "Last" },
  { key: "offerPrice", label: "Offer" },
  { key: "mrp", label: "MRP" },
];

function usablePrice(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function catalogPricesFromProduct(product: {
  lastPrice?: number | null;
  offerPrice?: number | null;
  mrp?: number | null;
  basePrice?: number | null;
}): CatalogPriceStackValue {
  return {
    lastPrice: usablePrice(product.lastPrice),
    offerPrice: usablePrice(product.offerPrice),
    mrp: usablePrice(product.mrp) ?? usablePrice(product.basePrice),
  };
}

export function CatalogPriceStack({
  prices,
  loading,
  onPick,
}: {
  prices?: CatalogPriceStackValue | null;
  loading?: boolean;
  onPick?: (price: number) => void;
}) {
  if (loading && !prices) {
    return <div className="px-0.5 pt-1.5 text-right text-[10px] text-mid-green">Fetching…</div>;
  }
  const rows = ROWS.map((row) => ({
    ...row,
    price: usablePrice(prices?.[row.key] ?? null),
  }));
  const any = rows.some((row) => row.price != null);
  if (!any) {
    return (
      <div className="px-0.5 pt-1.5 text-right text-xs text-mid-green">
        {loading ? "Fetching…" : "—"}
      </div>
    );
  }
  return (
    <div className="space-y-0.5 px-0.5 pt-0.5 text-right">
      {rows.map((row) =>
        row.price != null ? (
          onPick ? (
            <button
              key={row.key}
              type="button"
              className="block w-full text-right tabular-nums text-dark-primary"
              title={`${row.label} catalog price — copy into sell price`}
              onClick={() => onPick(row.price!)}
            >
              <span className="text-[10px] font-normal text-mid-green">{row.label}</span>{" "}
              <span className="text-xs font-medium">{formatMoney(row.price)}</span>
            </button>
          ) : (
            <div key={row.key} className="tabular-nums text-dark-primary">
              <span className="text-[10px] font-normal text-mid-green">{row.label}</span>{" "}
              <span className="text-xs font-medium">{formatMoney(row.price)}</span>
            </div>
          )
        ) : (
          <div key={row.key} className="text-[10px] text-mid-green/70">
            {row.label} —
          </div>
        )
      )}
    </div>
  );
}
