"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MasterDetailDialog } from "@/components/master-detail-dialog";
import {
  catalogProductRefLabel,
  hasMasterFields,
  productMasterFallback,
  type ProductMasterSeed,
} from "@/lib/master-data";

export type ProductDetailRecord = ProductMasterSeed & {
  id: string;
  code: string;
  name: string;
  description?: string;
  unit?: string;
  taxRate?: number;
  masterData?: Record<string, unknown> | null;
  active?: boolean;
};

export function ProductDetailDialog({
  productId,
  seed,
  actions,
  onClose,
}: {
  productId: string;
  seed?: Partial<ProductDetailRecord> | null;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ProductDetailRecord | null>(() =>
    seed
      ? {
          id: productId,
          code: seed.code || "",
          name: seed.name || "",
          ...seed,
        }
      : null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(`/api/products/${productId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Product not found");
          return;
        }
        setDetail(data as ProductDetailRecord);
      } catch {
        if (!cancelled) setError("Failed to load product details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const title = detail?.name || seed?.name || "Product details";
  const subtitle = catalogProductRefLabel({
    sourceProductId: detail?.sourceProductId ?? seed?.sourceProductId,
    code: detail?.code ?? seed?.code,
    name: undefined,
  });
  const category = detail?.category ?? seed?.category;
  const badge =
    detail?.gstTaxName ||
    seed?.gstTaxName ||
    (detail?.taxRate != null
      ? `GST ${detail.taxRate}%`
      : seed?.taxRate != null
        ? `GST ${seed.taxRate}%`
        : null);

  const masterSource = detail || seed;
  const data = masterSource
    ? {
        ...(hasMasterFields(detail?.masterData)
          ? detail!.masterData!
          : productMasterFallback(masterSource)),
        LastPrice:
          detail?.lastPrice != null
            ? detail.lastPrice
            : seed?.lastPrice != null
              ? seed.lastPrice
              : "",
      }
    : {};

  return (
    <MasterDetailDialog
      kind="product"
      title={title}
      subtitle={[subtitle !== "Mapped product" ? subtitle : null, category]
        .filter(Boolean)
        .join(" · ")}
      badge={badge}
      loading={loading}
      data={data}
      onClose={onClose}
      actions={actions}
    >
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
    </MasterDetailDialog>
  );
}
