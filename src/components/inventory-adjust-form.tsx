"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InventoryAdjustForm({
  products,
  warehouses,
}: {
  products: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [reason, setReason] = useState("Opening / adjustment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          productId,
          direction,
          quantity: Number(quantity),
          unitCost: direction === "in" ? Number(unitCost) : undefined,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adjustment failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!warehouses.length || !products.length) {
    return (
      <p className="text-sm text-mid-green">
        Seed organisation warehouse and products before adjusting stock.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl bg-white/40 p-4 sm:grid-cols-3">
      <label className="text-sm">
        Warehouse
        <select
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        Product
        <select
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Direction
        <select
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={direction}
          onChange={(e) => setDirection(e.target.value as "in" | "out")}
        >
          <option value="in">In (receipt / opening)</option>
          <option value="out">Out (adjustment)</option>
        </select>
      </label>
      <label className="text-sm">
        Quantity
        <input
          type="number"
          min="0.001"
          step="any"
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </label>
      <label className="text-sm">
        Unit cost (inbound)
        <input
          type="number"
          min="0"
          step="any"
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          disabled={direction === "out"}
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Reason
        <input
          className="mt-1 w-full rounded border border-light-green/40 bg-background px-2 py-1.5"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-mid-green px-4 py-2 text-sm text-background hover:bg-dark-secondary disabled:opacity-50"
        >
          {busy ? "Saving…" : "Post adjustment"}
        </button>
      </div>
      {error ? <p className="text-sm text-dark-primary sm:col-span-3">{error}</p> : null}
    </form>
  );
}
