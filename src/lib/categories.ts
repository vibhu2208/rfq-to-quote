/** Product / vendor taxonomy — matches catalog LeadCatName values. */
export const PRODUCT_CATEGORIES = [
  "ACCESSORIES",
  "AMARON BATTERIES",
  "ANTIVIRUS",
  "ATTENDANCE M/C",
  "BAG",
  "BATTERY",
  "BOARD",
  "CABLE",
  "CAMERA- Philips-",
  "CARTRIDGE",
  "CCTV",
  "Cisco",
  "Debit Note / Credit Note / Discount",
  "DESKTOP",
  "Electrical Goods",
  "Electronic Goods",
  "FIX ASSETS",
  "FURNITURE",
  "Hardware",
  "HDD",
  "HP SUPPLIES",
  "INTERACTIVE PANELS",
  "KEYBOARD",
  "LAPTOP",
  "LED Display Samsung",
  "LENOVO SERVER",
  "Misc",
  "MOUSE",
  "NETWORKING",
  "NETWORKING -SYROTECH",
  "old",
  "PENDRIVE",
  "PRINTER",
  "PROJECTOR",
  "RAM",
  "SCANNER",
  "SCRAP",
  "SERVER",
  "Services",
  "Software",
  "SOFTWARE & MICROSOFT",
  "SOUND-SPEAKERS-AHUJA-",
  "SPEAKER",
  "SSD",
  "Stationary",
  "STUDIO",
  "TFT",
  "TONER",
  "TONER ACCESSORIES",
  "UPS",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Fallback when AI / import cannot map to a concrete category. */
export const UNCATEGORIZED_CATEGORY: ProductCategory = "Misc";

export function isUncategorizedCategory(
  category: string | null | undefined
): boolean {
  const value = (category || "").trim();
  return (
    !value ||
    value === UNCATEGORIZED_CATEGORY ||
    value === "General / Uncategorized"
  );
}

export const PARSE_CONFIDENCE_THRESHOLD = 0.55;
