export type WarrantyUnit = "years" | "months" | "days";
export type WarrantyService = "" | "onsite" | "offsite" | "both";

export const WARRANTY_UNITS: { value: WarrantyUnit; label: string; singular: string }[] = [
  { value: "years", label: "Years", singular: "Year" },
  { value: "months", label: "Months", singular: "Month" },
  { value: "days", label: "Days", singular: "Day" },
];

export const WARRANTY_SERVICES: { value: WarrantyService; label: string }[] = [
  { value: "", label: "—" },
  { value: "onsite", label: "Onsite" },
  { value: "offsite", label: "Offsite" },
  { value: "both", label: "Onsite + Offsite" },
];

export function normalizeWarrantyUnit(raw?: string | null): WarrantyUnit {
  const v = (raw || "").trim().toLowerCase();
  if (v === "year" || v === "years") return "years";
  if (v === "month" || v === "months") return "months";
  if (v === "day" || v === "days") return "days";
  return "years";
}

export function normalizeWarrantyService(raw?: string | null): WarrantyService {
  const v = (raw || "").trim().toLowerCase();
  if (v === "onsite") return "onsite";
  if (v === "offsite") return "offsite";
  if (v === "both" || v === "onsite+offsite" || v === "all") return "both";
  return "";
}

export function clampWarrantyQty(qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(9999, Math.round(n));
}

export function formatWarrantyLabel(input: {
  warrantyQty?: number | null;
  warrantyUnit?: string | null;
  warrantyService?: string | null;
}): string {
  const qty = clampWarrantyQty(input.warrantyQty ?? 0);
  if (qty <= 0) return "";
  const unit = normalizeWarrantyUnit(input.warrantyUnit);
  const unitMeta = WARRANTY_UNITS.find((row) => row.value === unit) ?? WARRANTY_UNITS[0];
  const unitLabel = qty === 1 ? unitMeta.singular : unitMeta.label;
  const service = normalizeWarrantyService(input.warrantyService);
  const serviceLabel =
    WARRANTY_SERVICES.find((row) => row.value === service)?.label || "";
  if (service && serviceLabel && serviceLabel !== "—") {
    return `${qty} ${unitLabel} · ${serviceLabel}`;
  }
  return `${qty} ${unitLabel}`;
}
