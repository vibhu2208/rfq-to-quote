"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, Upload, X } from "lucide-react";
import { Money } from "@/components/ui";

type Product = {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  productType?: "GOODS" | "SERVICE";
  basePrice: number;
  offerPrice: number;
  taxRate: number;
  taxCategory: string;
  active: boolean;
};

const emptyForm = {
  code: "",
  name: "",
  description: "",
  unit: "pcs",
  productType: "GOODS" as "GOODS" | "SERVICE",
  basePrice: 0,
  offerPrice: 0,
  taxRate: 18,
  taxCategory: "GST18",
  active: true,
  openingQty: 0,
  openingUnitCost: 0,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [importMsg, setImportMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeFilter !== "all") params.set("active", activeFilter);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, activeFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      code: p.code,
      name: p.name,
      description: p.description,
      unit: p.unit,
      productType: p.productType === "SERVICE" ? "SERVICE" : "GOODS",
      basePrice: p.basePrice,
      offerPrice: p.offerPrice,
      taxRate: p.taxRate,
      taxCategory: p.taxCategory,
      active: p.active,
      openingQty: 0,
      openingUnitCost: p.basePrice,
    });
    setModalOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = editing ? `/api/products/${editing.id}` : "/api/products";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      alert(typeof err.error === "string" ? err.error : "Save failed");
      return;
    }
    setModalOpen(false);
    load();
  }

  async function onImport(file: File) {
    setImportMsg("Importing…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/products/import", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error || "Import failed");
      return;
    }
    setImportMsg(`Imported ${data.total}: ${data.created} created, ${data.updated} updated`);
    load();
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Product catalog</h1>
          <p className="mt-1 text-sm text-mid-green">
            Catalog syncs to inventory for goods · services are not stocked
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm hover:bg-light-green/20">
            <Upload className="h-4 w-4 text-mid-green" strokeWidth={1.5} />
            Import CSV/XLSX
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add product
          </button>
        </div>
      </div>

      {importMsg ? <p className="text-sm text-mid-green">{importMsg}</p> : null}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green" strokeWidth={1.5} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code or name…"
            className="w-full rounded-lg border border-light-green/40 bg-white/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
          className="rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm outline-none"
        >
          <option value="all">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium text-right">Base</th>
              <th className="px-4 py-3 font-medium text-right">Offer</th>
              <th className="px-4 py-3 font-medium text-right">Tax %</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-mid-green">
                  No products found
                </td>
              </tr>
            ) : (
              products.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? "bg-light-green/10" : undefined}>
                  <td className="px-4 py-3 font-medium">{p.code}</td>
                  <td className="px-4 py-3">
                    <div>{p.name}</div>
                    {p.description ? (
                      <div className="text-xs text-mid-green line-clamp-1">{p.description}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{p.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={p.basePrice} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={p.offerPrice} />
                  </td>
                  <td className="px-4 py-3 text-right">{p.taxRate}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        p.active ? "bg-mid-green/20 text-mid-green" : "bg-dark-primary/10 text-dark-primary"
                      }`}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded p-1.5 text-mid-green hover:bg-light-green/30"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                      {p.active ? (
                        <button
                          type="button"
                          onClick={() => deactivate(p.id)}
                          className="rounded p-1.5 text-dark-primary/60 hover:bg-light-green/30"
                          title="Deactivate"
                        >
                          <X className="h-4 w-4" strokeWidth={1.5} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4">
          <form
            onSubmit={onSave}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold">{editing ? "Edit product" : "Add product"}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-1">
                <span className="mb-1 block text-mid-green">Type</span>
                <select
                  value={form.productType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      productType: e.target.value as "GOODS" | "SERVICE",
                    }))
                  }
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                >
                  <option value="GOODS">Goods (inventory)</option>
                  <option value="SERVICE">Service (no stock)</option>
                </select>
              </label>
              {(
                [
                  ["code", "Code", "text"],
                  ["name", "Name", "text"],
                  ["unit", "Unit", "text"],
                  ["taxCategory", "Tax category", "text"],
                  ["basePrice", "Base price", "number"],
                  ["offerPrice", "Offer price", "number"],
                  ["taxRate", "Tax rate %", "number"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="block text-sm sm:col-span-1">
                  <span className="mb-1 block text-mid-green">{label}</span>
                  <input
                    type={type}
                    step={type === "number" ? "0.01" : undefined}
                    value={form[key] as string | number}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [key]: type === "number" ? Number(e.target.value) : e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                    required={key === "code" || key === "name"}
                  />
                </label>
              ))}
              {!editing && form.productType === "GOODS" ? (
                <>
                  <label className="block text-sm sm:col-span-1">
                    <span className="mb-1 block text-mid-green">Opening qty</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.openingQty}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, openingQty: Number(e.target.value) }))
                      }
                      className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="block text-sm sm:col-span-1">
                    <span className="mb-1 block text-mid-green">Opening unit cost</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={form.openingUnitCost}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, openingUnitCost: Number(e.target.value) }))
                      }
                      className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                    />
                  </label>
                </>
              ) : null}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-mid-green">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-mid-green hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
