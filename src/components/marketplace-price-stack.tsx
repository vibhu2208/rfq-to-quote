"use client";

import { formatMoney } from "@/lib/tax";
import type { MarketplaceBestPrice } from "@/lib/marketplace/summary";

const ROWS: Array<{ key: "amazon" | "flipkart" | "indiamart"; label: string }> = [
  { key: "amazon", label: "Amazon" },
  { key: "flipkart", label: "Flipkart" },
  { key: "indiamart", label: "IndiaMART" },
];

export type MarketplacePriceStackValue = {
  amazon: MarketplaceBestPrice | null;
  flipkart: MarketplaceBestPrice | null;
  indiamart: MarketplaceBestPrice | null;
};

export function MarketplacePriceStack({
  prices,
  loading,
  onPick,
}: {
  prices?: MarketplacePriceStackValue | null;
  loading?: boolean;
  onPick?: (price: number) => void;
}) {
  if (loading && !prices) {
    return <div className="px-0.5 pt-1.5 text-right text-[10px] text-mid-green">Fetching…</div>;
  }
  const rows = ROWS.map((row) => ({ ...row, listing: prices?.[row.key] ?? null }));
  const any = rows.some((row) => row.listing);
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
        row.listing ? (
          <div key={row.key} className="leading-tight">
            {onPick ? (
              <button
                type="button"
                className="block w-full text-right tabular-nums text-dark-primary"
                title={`${row.listing.title} — copy into sell price`}
                onClick={() => onPick(row.listing!.price)}
              >
                <span className="text-[10px] font-normal text-mid-green">{row.label}</span>{" "}
                <span className="text-xs font-medium">{formatMoney(row.listing.price)}</span>
              </button>
            ) : (
              <a
                href={row.listing.link || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block tabular-nums text-dark-primary hover:underline"
                title={row.listing.title}
              >
                <span className="text-[10px] font-normal text-mid-green">{row.label}</span>{" "}
                <span className="text-xs font-medium">{formatMoney(row.listing.price)}</span>
              </a>
            )}
          </div>
        ) : (
          <div key={row.key} className="text-[10px] text-mid-green/70">
            {row.label} —
          </div>
        )
      )}
    </div>
  );
}
