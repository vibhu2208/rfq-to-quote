/** Taxonomy for electronics trader RFQs — used in AI prompts. */
export const PRODUCT_CATEGORIES = [
  "CCTV & Surveillance",
  "Computers & Laptops",
  "Monitors & Displays",
  "Storage (HDD / SSD)",
  "Memory (RAM)",
  "Networking & Cables",
  "UPS & Power",
  "Installation & Service",
  "General / Uncategorized",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PARSE_CONFIDENCE_THRESHOLD = 0.55;
