"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Package, Search, X } from "lucide-react";
import { Money } from "@/components/ui";

export type PickableProduct = {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  offerPrice: number;
  taxRate: number;
};

type InventoryBalance = {
  productId: string;
  quantityOnHand: number;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
};

function stockLabel(qty: number | undefined, unit?: string): string {
  if (qty == null) return "—";
  return `${qty} ${unit || "pcs"}`;
}

function StockBadge({
  qty,
  unit,
  required,
}: {
  qty: number | undefined;
  unit?: string;
  required?: number;
}) {
  const low = required != null && qty != null && qty < required;
  const out = qty != null && qty <= 0;

  return (
    <span
      className={`tabular-nums ${
        out ? "text-dark-primary" : low ? "text-amber-700" : "text-mid-green"
      }`}
    >
      {qty == null ? "—" : stockLabel(qty, unit)}
      {low && qty != null && qty > 0 ? (
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">Low</span>
      ) : null}
      {out ? (
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">Out</span>
      ) : null}
    </span>
  );
}

export function useInventoryMap() {
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/inventory/balances?sync=false");
      if (!res.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const row of (data.balances || []) as InventoryBalance[]) {
        map[row.productId] = row.quantityOnHand;
      }
      if (!cancelled) {
        setInventoryMap(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { inventoryMap, inventoryLoading: loading };
}

type DropdownRect = { top: number; left: number; width: number };

function SearchResultRow({
  product,
  inventoryMap,
  requiredQty,
  onSelect,
}: {
  product: PickableProduct;
  inventoryMap: Record<string, number>;
  requiredQty?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-light-green/15 px-3 py-2.5 text-left last:border-b-0 hover:bg-light-green/15"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-dark-primary">{product.name}</div>
        <div className="mt-0.5 truncate text-xs text-mid-green">{product.code}</div>
      </div>
      <div className="text-right text-xs">
        <div className="text-mid-green">Stock</div>
        <StockBadge
          qty={inventoryMap[product.id]}
          unit={product.unit}
          required={requiredQty}
        />
      </div>
      <div className="text-right text-sm font-semibold tabular-nums text-dark-primary">
        <Money value={product.offerPrice} />
      </div>
    </button>
  );
}

type ProductSearchProps = {
  placeholder?: string;
  inventoryMap: Record<string, number>;
  onSelect: (product: PickableProduct) => void;
  requiredQty?: number;
  autoFocus?: boolean;
  onClose?: () => void;
  label?: string;
};

export function RfqProductSearch({
  placeholder = "Type product name or code…",
  inventoryMap,
  onSelect,
  requiredQty,
  autoFocus = false,
  onClose,
  label,
}: ProductSearchProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<PickableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const updateRect = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setRect({
      top: box.bottom + 6,
      left: box.left,
      width: Math.max(box.width, 320),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScrollOrResize = () => updateRect();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const portal = document.getElementById(listId);
      if (portal?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, listId]);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(q)}&active=true&take=10`
      );
      const data = await res.json();
      setHits(Array.isArray(data) ? data : []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  function pick(product: PickableProduct) {
    onSelect(product);
    setQ("");
    setHits([]);
    setOpen(false);
    onClose?.();
  }

  const dropdown =
    open && mounted && rect ? (
      <div
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          zIndex: 60,
        }}
        className="overflow-hidden rounded-xl border border-light-green/50 bg-background shadow-xl"
      >
        <div className="border-b border-light-green/20 bg-dark-secondary/5 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-mid-green">
          <span className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3">
            <span>Product</span>
            <span className="w-16 text-right">Stock</span>
            <span className="w-20 text-right">Price</span>
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-4 text-sm text-mid-green">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-4 text-sm text-mid-green">
              {q.trim() ? "No products found" : "Start typing to search"}
            </p>
          ) : (
            hits.map((h) => (
              <SearchResultRow
                key={h.id}
                product={h}
                inventoryMap={inventoryMap}
                requiredQty={requiredQty}
                onSelect={() => pick(h)}
              />
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      {label ? (
        <label className="mb-1.5 block text-xs font-medium text-mid-green">{label}</label>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              updateRect();
            }}
            onFocus={() => {
              setOpen(true);
              updateRect();
            }}
            placeholder={placeholder}
            className="w-full rounded-lg border border-light-green/40 bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
          />
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-light-green/40 p-2 text-mid-green hover:bg-light-green/15"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

type InventoryPickerProps = {
  inventoryMap: Record<string, number>;
  onSelect: (product: PickableProduct) => void;
  loading?: boolean;
};

export function RfqInventoryPicker({
  inventoryMap,
  onSelect,
  loading = false,
}: InventoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<
    Array<{
      productId: string;
      quantityOnHand: number;
      product: PickableProduct;
    }>
  >([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      const res = await fetch("/api/inventory/balances?sync=false");
      if (!res.ok) {
        if (!cancelled) setFetching(false);
        return;
      }
      const data = await res.json();
      const balances = (data.balances || []) as InventoryBalance[];
      const productsRes = await fetch("/api/products?active=true&take=500");
      const products = productsRes.ok ? ((await productsRes.json()) as PickableProduct[]) : [];
      const byId = new Map(products.map((p) => [p.id, p]));

      const merged = balances
        .map((b) => {
          const p = byId.get(b.product.id);
          if (!p) return null;
          return {
            productId: b.productId,
            quantityOnHand: b.quantityOnHand,
            product: p,
          };
        })
        .filter(Boolean) as Array<{
        productId: string;
        quantityOnHand: number;
        product: PickableProduct;
      }>;

      if (!cancelled) {
        setRows(merged);
        setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = rows.filter((row) => {
    if (!q.trim()) return true;
    const blob = `${row.product.code} ${row.product.name}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .every((t) => blob.includes(t));
  });

  return (
    <div className="rounded-lg border border-light-green/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 font-medium text-mid-green">
          <Package className="h-4 w-4" />
          Browse inventory
        </span>
        <ChevronDown
          className={`h-4 w-4 text-mid-green transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-light-green/20 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter in-stock products…"
            className="mb-2 w-full rounded-lg border border-light-green/40 bg-background px-3 py-2 text-sm outline-none focus:border-mid-green"
          />
          {loading || fetching ? (
            <p className="py-3 text-sm text-mid-green">Loading inventory…</p>
          ) : filtered.length === 0 ? (
            <p className="py-3 text-sm text-mid-green">
              No stocked products found.{" "}
              <Link href="/inventory" className="underline">
                Open inventory
              </Link>
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-light-green/20">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background text-xs text-mid-green">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="w-20 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((row) => (
                    <tr key={row.productId} className="border-t border-light-green/10">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.product.code}</div>
                        <div className="line-clamp-1 text-xs text-mid-green">{row.product.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {stockLabel(row.quantityOnHand, row.product.unit)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Money value={row.product.offerPrice} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onSelect(row.product)}
                          className="rounded-md border border-mid-green/40 px-2 py-1 text-xs font-medium hover:bg-light-green/20"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ProductStockCell({
  productId,
  unit,
  inventoryMap,
  requiredQty,
}: {
  productId: string;
  unit: string;
  inventoryMap: Record<string, number>;
  requiredQty?: number;
}) {
  return (
    <StockBadge qty={inventoryMap[productId]} unit={unit} required={requiredQty} />
  );
}
