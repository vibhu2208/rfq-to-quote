import { canonicalizeProductCategory } from "@/lib/categories";

type ProductKeyInput = {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
};

/** Single-segment / category-only keys are too broad for price history reuse. */
const BROAD_PRODUCT_KEYS = new Set([
  "general",
  "misc",
  "manual",
  "old",
  "printers",
  "printer",
  "scanners",
  "scanner",
  "monitors",
  "monitor",
  "tft",
  "computers",
  "computer",
  "desktop",
  "laptops",
  "laptop",
  "network",
  "networking",
  "cables",
  "cable",
  "ups",
  "power",
  "battery",
  "storage",
  "hdd",
  "ssd",
  "ram",
  "memory",
  "cctv",
  "camera",
  "cameras",
  "server",
  "toner",
  "cartridge",
  "software",
  "services",
  "hardware",
  "accessories",
]);

const SKIP_SPEC_KEYS = new Set([
  "_meta",
  "quantity",
  "qty",
  "unit",
  "items",
  "budget",
  "currency",
]);

function flatten(value: unknown, output: string[] = []): string[] {
  if (value == null) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  // Numbers alone (qty, etc.) must not become model tokens like "150".
  if (typeof value === "number") return output;
  if (Array.isArray(value)) {
    value.forEach((entry) => flatten(entry, output));
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (SKIP_SPEC_KEYS.has(key)) return;
      // Keep useful values only — not object key names like "description".
      flatten(entry, output);
    });
  }
  return output;
}

function firstMatch(text: string, expressions: RegExp[]): string | null {
  for (const expression of expressions) {
    const match = text.match(expression);
    if (match) return (match[1] || match[0]).toLowerCase().replace(/\s+/g, "");
  }
  return null;
}

function compact(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const PANEL_BRANDS =
  /\b(viewsonic|samsung|lg|benq|sharp|promethean|clevertouch|newline|maxhub)\b/i;
const PC_BRANDS =
  /\b(dell|lenovo|hp|asus|acer|apple)\b/i;
const GENERIC_BRANDS =
  /\b(samsung|hp|canon|epson|brother|ricoh|xerox|kyocera|dell|lenovo|asus|acer|apple|cisco|tp-?link|d-?link|hikvision|dahua|amaron|exide|viewsonic|lg|benq|logitech|philips|phillips|harman|jbl|ahuja)\b/i;

/** Prefer category-relevant brands so "Microsoft Teams" does not beat ViewSonic on an IFP line. */
function extractBrand(
  text: string,
  prefer: "panel" | "pc" | "any" = "any"
): string | null {
  if (prefer === "panel") {
    const panel = text.match(PANEL_BRANDS);
    if (panel) return panel[1].toLowerCase().replace(/\s+/g, "");
    return null;
  }
  if (prefer === "pc") {
    const pc = text.match(PC_BRANDS);
    if (pc) return pc[1].toLowerCase().replace(/\s+/g, "");
  }
  const any = text.match(GENERIC_BRANDS);
  return any ? any[1].toLowerCase().replace(/\s+/g, "") : null;
}

function looksLikeInteractivePanel(
  category: string,
  detailText: string
): boolean {
  if (category === "INTERACTIVE PANELS") return true;
  return (
    /\bifp(?:d)?\b/i.test(detailText) ||
    /interactive(?:\s+\w+){0,3}\s+panels?\b/i.test(detailText) ||
    /interactive(?:\s+\w+){0,2}\s+displays?\b/i.test(detailText) ||
    /\bfront\s+panels?\b/i.test(detailText) ||
    /\bsmart\s*boards?\b/i.test(detailText) ||
    /\btouch\s*displays?\b/i.test(detailText)
  );
}

/**
 * True when a product key is specific enough to reuse vendor last-quoted prices.
 * Broad keys like "printers" / "general" must not leak prices across unrelated SKUs.
 */
export function isSpecificProductKey(productKey: string | null | undefined): boolean {
  const key = (productKey || "").trim().toLowerCase();
  if (!key || BROAD_PRODUCT_KEYS.has(key)) return false;
  const segments = key.split("-").filter(Boolean);
  // kind + brand alone (printer-hp, laptop-dell) is too broad for price reuse.
  if (segments.length < 3) return false;
  // Need a model / capacity / size style token beyond kind+brand.
  return segments.slice(2).some(
    (segment) => /\d/.test(segment) || segment.length >= 5
  );
}

/**
 * Produces a stable, deterministic lookup key from parsed RFQ fields.
 * This helper does not call AI. Prefer specific brand/model keys when present;
 * otherwise return a broad category key (which must not drive price history).
 */
export function normalizeProductKey(input: ProductKeyInput): string {
  const detailText = [
    input.subject || "",
    ...flatten(input.parsedSpecs),
    input.rawText?.slice(0, 800) || "",
  ]
    .join(" ")
    .toLowerCase();
  const text = `${input.parsedCategory || ""} ${detailText}`.toLowerCase();
  const category =
    canonicalizeProductCategory(input.parsedCategory) ||
    input.parsedCategory ||
    "";

  const size = firstMatch(text, [
    /\b(\d{2}(?:\.\d+)?)\s*(?:inch|inches|in\b|")/,
    /\b(\d{2})\s*(?:display|screen|monitor|ifp|panel)\b/,
  ]);
  const resolution = firstMatch(text, [
    /\b(4k|uhd|qhd|fhd|1080p|720p)\b/,
    /\b(\d+(?:\.\d+)?mp)\b/,
  ]);
  const processor = firstMatch(text, [
    /\b(?:core\s*)?(i[3579])\b/,
    /\b(ryzen\s*[3579])\b/,
  ]);
  const memory = firstMatch(text, [/\b(\d+\s*gb)\s*(?:ddr\d?|ram)\b/]);
  const storage = firstMatch(text, [
    /\b(?:storage\s*)?(\d+\s*(?:gb|tb))\s*(?:ssd|hdd)\b/,
  ]);
  const model = firstMatch(text, [
    /\b([a-z]{0,4}\d{2,}[a-z0-9-]{1,12})\b/i,
    /\b(mfp|laserjet|deskjet|officejet|pixma|ecotank)\b/,
  ]);

  // Category-first routing. Text fallbacks only when category is missing/weak.
  if (looksLikeInteractivePanel(category, detailText)) {
    const brand = extractBrand(text, "panel");
    const ops = firstMatch(text, [/\bops\b/i]) ? "ops" : null;
    return compact(["ifp", brand, size, ops]) || "ifp";
  }

  if (
    category === "PRINTER" ||
    category === "SCANNER" ||
    category === "CARTRIDGE" ||
    category === "TONER" ||
    category === "TONER ACCESSORIES" ||
    category === "HP SUPPLIES" ||
    (!category &&
      (/\bprinters?\b/.test(detailText) ||
        /\bscanners?\b/.test(detailText) ||
        /\bmfp\b/.test(detailText) ||
        /\bmultifunction\b/.test(detailText)))
  ) {
    const brand = extractBrand(text, "any");
    const kind =
      category === "SCANNER" || /\bscanners?\b/.test(detailText)
        ? "scanner"
        : category === "TONER" ||
            category === "TONER ACCESSORIES" ||
            /\btoners?\b/.test(detailText)
          ? "toner"
          : category === "CARTRIDGE" || /\bcartridges?\b/.test(detailText)
            ? "cartridge"
            : "printer";
    return (
      compact([kind, brand, model]) || compact([kind, brand]) || kind
    );
  }

  if (
    category === "TFT" ||
    category === "LED Display Samsung" ||
    (!category &&
      /\bmonitors?\b/.test(detailText) &&
      !/\bscreen\s*cost\b/i.test(detailText) &&
      !/\bper\s+screen\b/i.test(detailText))
  ) {
    const brand = extractBrand(text, "panel");
    const panel = firstMatch(text, [/\b(led|ips|oled|va|tn)\b/]);
    const displayRes = firstMatch(text, [/\b(4k|uhd|qhd|fhd|1080p|720p)\b/]);
    return (
      compact(["monitor", brand, size, displayRes || panel]) || "monitor"
    );
  }

  if (
    category === "CCTV" ||
    category === "CAMERA- Philips-" ||
    (!category &&
      (/\bcctv\b/.test(detailText) ||
        /\bcameras?\b/.test(detailText) ||
        /\bdvr\b/.test(detailText) ||
        /\bnvr\b/.test(detailText)))
  ) {
    const brand = extractBrand(text, "any");
    const type = firstMatch(text, [/\b(dome|bullet|ptz|dvr|nvr)\b/]);
    const cameraMp = firstMatch(text, [/\b(\d+(?:\.\d+)?mp)\b/]);
    return compact(["cctv", brand, cameraMp || resolution, type]) || "cctv";
  }

  if (category === "Services" || category === "Software" || category === "SOFTWARE & MICROSOFT") {
    const brand = extractBrand(text, "any");
    const kind =
      category === "Services"
        ? "services"
        : category === "SOFTWARE & MICROSOFT"
          ? "microsoft-software"
          : "software";
    return compact([kind, brand, model]) || kind;
  }

  if (category === "RAM") {
    const generation = firstMatch(text, [/\b(ddr[345])\b/]);
    return compact(["ram", memory, generation]) || "ram";
  }

  if (category === "HDD" || category === "SSD" || category === "PENDRIVE") {
    const type =
      category === "SSD" || detailText.includes("ssd")
        ? "ssd"
        : category === "PENDRIVE" || detailText.includes("pendrive")
          ? "pendrive"
          : "hdd";
    return compact(["storage", storage, type]) || type;
  }

  if (
    category === "UPS" ||
    category === "BATTERY" ||
    category === "AMARON BATTERIES"
  ) {
    const brand = extractBrand(text, "any");
    const capacity = firstMatch(text, [/\b(\d+(?:\.\d+)?\s*(?:kva|va|ah))\b/]);
    const kind =
      category === "BATTERY" ||
      category === "AMARON BATTERIES" ||
      detailText.includes("battery")
        ? "battery"
        : "ups";
    return compact([kind, brand, capacity]) || kind;
  }

  if (
    category === "NETWORKING" ||
    category === "NETWORKING -SYROTECH" ||
    category === "CABLE" ||
    category === "Cisco"
  ) {
    const brand = extractBrand(text, "any");
    const networkType = firstMatch(text, [
      /\b(poe|cat[5-8]e?|gigabit|router|switch)\b/,
    ]);
    return compact(["network", brand, networkType, model]) || "network";
  }

  if (
    category === "DESKTOP" ||
    category === "LAPTOP" ||
    category === "SERVER" ||
    category === "LENOVO SERVER" ||
    detailText.includes("laptop") ||
    detailText.includes("desktop") ||
    detailText.includes("computer") ||
    /\bpc\b/.test(detailText)
  ) {
    const brand = extractBrand(text, "pc");
    const form =
      category === "LAPTOP" || detailText.includes("laptop")
        ? "laptop"
        : category === "SERVER" ||
            category === "LENOVO SERVER" ||
            detailText.includes("server")
          ? "server"
          : "desktop";
    return compact([form, brand, processor, memory, storage]) || form;
  }

  if (/\bram\b/.test(detailText)) {
    const generation = firstMatch(text, [/\b(ddr[345])\b/]);
    return compact(["ram", memory, generation]) || "ram";
  }

  if (detailText.includes("ssd") || detailText.includes("hdd")) {
    const type = firstMatch(text, [/\b(ssd|hdd)\b/]);
    return compact(["storage", storage, type]) || "storage";
  }

  // Prefer brand + model when we have them even outside known categories.
  const brand = extractBrand(text, "any");
  if (brand && model) {
    return compact([brand, model]);
  }

  const categoryKey = (input.parsedCategory || "general")
    .replace(/\([^)]*\)/g, "")
    .split(/[&/]/)[0];
  return compact([categoryKey]) || "general";
}
