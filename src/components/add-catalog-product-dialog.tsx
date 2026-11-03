"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  type CatalogProductDraft,
  type CatalogRequirementInput,
  draftFromRequirement,
} from "@/lib/catalog-product-draft";
import { quoteUnitOptions } from "@/lib/quote-format";
import { apiFetch, parseApiJson, userFacingFetchError } from "@/lib/fetch-error";
import type { PickableProduct } from "@/components/rfq-product-picker";

type CreatedProduct = PickableProduct & {
  sellPrice?: number;
  mrp?: number | null;
};

function emptyToPayload(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function AddCatalogProductDialog({
  requirement,
  onClose,
  onCreated,
}: {
  requirement: CatalogRequirementInput;
  onClose: () => void;
  onCreated: (product: PickableProduct) => void;
}) {
  const [form, setForm] = useState<CatalogProductDraft>(() => draftFromRequirement(requirement));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(draftFromRequirement(requirement));
    setError("");
  }, [requirement]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
          unit: form.unit.trim() || "pcs",
          productType: form.productType,
          basePrice: form.basePrice,
          offerPrice: form.offerPrice,
          taxRate: form.taxRate,
          taxCategory: form.taxCategory.trim() || "GST18",
          active: form.active,
          openingQty: form.productType === "GOODS" ? form.openingQty : 0,
          openingUnitCost: form.productType === "GOODS" ? form.openingUnitCost : 0,
          brand: emptyToPayload(form.brand),
          hsnCode: emptyToPayload(form.hsnCode),
          modelNo: emptyToPayload(form.modelNo),
          partNo: emptyToPayload(form.partNo),
          category: emptyToPayload(form.category),
        }),
      });
      const data = await parseApiJson<CreatedProduct & { error?: unknown }>(
        res,
        "Could not add the product."
      );
      if (!res.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : "Fill the required fields and try again.";
        setError(message);
        return;
      }
      onCreated({
        id: data.id,
        code: data.code,
        name: data.name,
        description: data.description,
        unit: data.unit,
        offerPrice:
          (data.sellPrice && data.sellPrice > 0
            ? data.sellPrice
            : data.lastPrice && data.lastPrice > 0
              ? data.lastPrice
              : data.offerPrice) || 0,
        lastPrice: data.lastPrice ?? null,
        taxRate: data.taxRate,
      });
    } catch (err) {
      setError(userFacingFetchError(err, "Could not add the product."));
    } finally {
      setSaving(false);
    }
  }

  const units = quoteUnitOptions(form.unit);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-dark-primary/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-catalog-title"
      onClick={onClose}
    >
      <form
        onSubmit={onSave}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-catalog-title" className="text-lg font-semibold">
              Add to catalog
            </h2>
            <p className="mt-1 text-sm text-mid-green">
              No catalog match for this requirement. Fill the product fields and save it to
              your catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mid-green hover:bg-light-green/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
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
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Code</span>
            <input
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-mid-green">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Unit</span>
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            >
              {units.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Tax category</span>
            <input
              value={form.taxCategory}
              onChange={(e) => setForm((f) => ({ ...f, taxCategory: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Base price</span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.basePrice}
              onChange={(e) => setForm((f) => ({ ...f, basePrice: Number(e.target.value) }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Offer price</span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.offerPrice}
              onChange={(e) => setForm((f) => ({ ...f, offerPrice: Number(e.target.value) }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Tax rate %</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.taxRate}
              onChange={(e) => setForm((f) => ({ ...f, taxRate: Number(e.target.value) }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Brand</span>
            <input
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Model</span>
            <input
              value={form.modelNo}
              onChange={(e) => setForm((f) => ({ ...f, modelNo: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">Category</span>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-mid-green">HSN</span>
            <input
              value={form.hsnCode}
              onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
              className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
            />
          </label>
          {form.productType === "GOODS" ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-mid-green">Opening qty</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.openingQty}
                  onChange={(e) => setForm((f) => ({ ...f, openingQty: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-light-green/40 bg-white/60 px-3 py-2 outline-none focus:border-mid-green"
                />
              </label>
              <label className="block text-sm">
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
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-mid-green hover:bg-light-green/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save to catalog"}
          </button>
        </div>
      </form>
    </div>
  );
}
