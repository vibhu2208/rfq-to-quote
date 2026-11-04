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

function flatten(value: unknown, output: string[] = []): string[] {
  if (value == null) return output;
  if (typeof value === "string" || typeof value === "number") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flatten(entry, output));
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (key !== "_meta") output.push(key);
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

/**
 * True when a product key is specific enough to reuse vendor last-quoted prices.
 * Broad keys like "printers" / "general" must not leak prices across unrelated SKUs.
 */
export function isSpecificProductKey(productKey: string | null | undefined): boolean {
  const key = (productKey || "").trim().toLowerCase();
  if (!key || BROAD_PRODUCT_KEYS.has(key)) return false;
  const segments = key.split("-").filter(Boolean);
  if (segments.length < 2) return false;
  // Need at least one segment that looks like a model / capacity / size token.
  return segments.some(
    (segment) =>
      /\d/.test(segment) ||
      segment.length >= 4
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
  const category = input.parsedCategory || "";

  const size = firstMatch(text, [
    /\b(\d{2}(?:\.\d+)?)\s*(?:inch|inches|in\b|")/,
    /\b(\d{2})\s*(?:display|screen|monitor)\b/,
  ]);
  const resolution = firstMatch(text, [
    /\b(\d+(?:\.\d+)?mp)\b/,
    /\b(4k|uhd|qhd|fhd|1080p|720p)\b/,
  ]);
  const processor = firstMatch(text, [
    /\b(?:core\s*)?(i[3579])\b/,
    /\b(ryzen\s*[3579])\b/,
  ]);
  const memory = firstMatch(text, [/\b(\d+\s*gb)\s*(?:ddr\d?|ram)\b/]);
  const storage = firstMatch(text, [
    /\b(?:storage\s*)?(\d+\s*(?:gb|tb))\s*(?:ssd|hdd)\b/,
  ]);
  const brand = firstMatch(text, [
    /\b(samsung|hp|canon|epson|brother|ricoh|xerox|kyocera|dell|lenovo|asus|acer|apple|microsoft|cisco|tp-?link|d-?link|hikvision|dahua|amaron|exide|viewsonic|lg|benq|logitech)\b/,
  ]);
  const model = firstMatch(text, [
    /\b([a-z]{0,4}\d{2,}[a-z0-9-]{1,12})\b/i,
    /\b(mfp|laserjet|deskjet|officejet|pixma|ecotank)\b/,
  ]);

  if (
    category === "PRINTER" ||
    category === "SCANNER" ||
    category === "CARTRIDGE" ||
    category === "TONER" ||
    category === "TONER ACCESSORIES" ||
    category === "HP SUPPLIES" ||
    category.toLowerCase().includes("printer") ||
    detailText.includes("printer") ||
    detailText.includes("scanner") ||
    detailText.includes("mfp") ||
    detailText.includes("multifunction")
  ) {
    const kind =
      category === "SCANNER" || detailText.includes("scanner")
        ? "scanner"
        : category === "TONER" ||
            category === "TONER ACCESSORIES" ||
            detailText.includes("toner")
          ? "toner"
          : category === "CARTRIDGE" || detailText.includes("cartridge")
            ? "cartridge"
            : "printer";
    return (
      compact([kind, brand, model]) || compact([kind, brand]) || kind
    );
  }

  if (
    category === "TFT" ||
    category === "LED Display Samsung" ||
    category === "INTERACTIVE PANELS" ||
    detailText.includes("monitor") ||
    detailText.includes("display") ||
    detailText.includes("screen")
  ) {
    const panel = firstMatch(text, [/\b(led|ips|oled|va|tn)\b/]);
    return compact(["monitor", brand, size, resolution || panel]) || "monitor";
  }

  if (
    category === "CCTV" ||
    category === "CAMERA- Philips-" ||
    detailText.includes("cctv") ||
    detailText.includes("camera") ||
    detailText.includes("dvr") ||
    detailText.includes("nvr")
  ) {
    const type = firstMatch(text, [/\b(dome|bullet|ptz|dvr|nvr)\b/]);
    return compact(["cctv", brand, resolution, type]) || "cctv";
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

  if (detailText.includes("ram")) {
    const generation = firstMatch(text, [/\b(ddr[345])\b/]);
    return compact(["ram", memory, generation]) || "ram";
  }

  if (detailText.includes("ssd") || detailText.includes("hdd")) {
    const type = firstMatch(text, [/\b(ssd|hdd)\b/]);
    return compact(["storage", storage, type]) || "storage";
  }

  // Prefer brand + model when we have them even outside known categories.
  if (brand && model) {
    return compact([brand, model]);
  }

  const categoryKey = (input.parsedCategory || "general")
    .replace(/\([^)]*\)/g, "")
    .split(/[&/]/)[0];
  return compact([categoryKey]) || "general";
}
