type ProductKeyInput = {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
};

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
 * Produces a stable, deterministic lookup key from parsed RFQ fields.
 * This helper does not call AI and deliberately returns a broad key when
 * attributes are missing rather than guessing.
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

  if (
    category === "Monitors & Displays" ||
    detailText.includes("monitor") ||
    detailText.includes("display") ||
    detailText.includes("screen")
  ) {
    const panel = firstMatch(text, [/\b(led|ips|oled|va|tn)\b/]);
    return compact(["monitor", size, resolution || panel]);
  }

  if (
    category === "CCTV & Surveillance" ||
    detailText.includes("cctv") ||
    detailText.includes("camera") ||
    detailText.includes("dvr") ||
    detailText.includes("nvr")
  ) {
    const type = firstMatch(text, [/\b(dome|bullet|ptz|dvr|nvr)\b/]);
    return compact(["cctv", resolution, type]);
  }

  if (category === "Memory (RAM)") {
    const generation = firstMatch(text, [/\b(ddr[345])\b/]);
    return compact(["ram", memory, generation]);
  }

  if (
    category === "Storage (HDD / SSD)"
  ) {
    const type = firstMatch(text, [/\b(ssd|hdd)\b/]);
    return compact(["storage", storage, type]);
  }

  if (category === "UPS & Power") {
    const capacity = firstMatch(text, [/\b(\d+(?:\.\d+)?\s*(?:kva|va))\b/]);
    return compact(["ups", capacity]);
  }

  if (category === "Networking & Cables") {
    const networkType = firstMatch(text, [/\b(poe|cat[5-8]e?|gigabit|router|switch)\b/]);
    return compact(["network", networkType]);
  }

  if (
    category === "Computers & Laptops" ||
    detailText.includes("laptop") ||
    detailText.includes("desktop") ||
    detailText.includes("computer") ||
    /\bpc\b/.test(detailText)
  ) {
    const form = detailText.includes("laptop") ? "laptop" : "computer";
    return compact([form, processor, memory, storage]);
  }

  if (detailText.includes("ram")) {
    const generation = firstMatch(text, [/\b(ddr[345])\b/]);
    return compact(["ram", memory, generation]);
  }

  if (detailText.includes("ssd") || detailText.includes("hdd")) {
    const type = firstMatch(text, [/\b(ssd|hdd)\b/]);
    return compact(["storage", storage, type]);
  }

  const categoryKey = (input.parsedCategory || "general")
    .replace(/\([^)]*\)/g, "")
    .split(/[&/]/)[0];
  return compact([categoryKey]) || "general";
}
