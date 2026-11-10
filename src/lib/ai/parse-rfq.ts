import {
  PRODUCT_CATEGORIES,
  PARSE_CONFIDENCE_THRESHOLD,
  normalizeParsedItemCategories,
  resolveProductCategory,
} from "@/lib/categories";
import { looksLikePromotionalEmail } from "@/lib/inbound-requirement";
import { resolveParsedItems } from "@/lib/rfq-items";

export type ParsedRfqItem = {
  description?: string | null;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  specs?: Record<string, string | number | boolean | null>;
};

export type ParsedRfqSpecs = {
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  budget?: number | null;
  currency?: string | null;
  description?: string | null;
  specs?: Record<string, string | number | boolean | null>;
  items?: ParsedRfqItem[];
  [key: string]: unknown;
};

export type ParseRfqResult = {
  productCategory: string;
  specs: ParsedRfqSpecs;
  items: ParsedRfqItem[];
  language: string;
  confidence: number;
  summary: string;
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function parseRfqWithAi(rawText: string, subject?: string): Promise<ParseRfqResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const categories = PRODUCT_CATEGORIES.join(", ");

  const system = `You extract structured RFQ (request for quote) data from messy customer messages.
Return ONLY valid JSON with this exact shape:
{
  "productCategory": string,  // MUST be one of: ${categories} — primary / dominant category
  "specs": {
    "brand": string|null,
    "quantity": number|null,
    "unit": string|null,
    "budget": number|null,
    "currency": string|null,
    "description": string|null,
    "specs": { }  // extra key/value product attributes for the primary item
  },
  "items": [
    {
      "description": string,   // what the customer wants for this line
      "brand": string|null,
      "quantity": number|null,
      "unit": string|null,
      "category": string|null, // closest category from: ${categories}
      "specs": { }             // extra attributes for this line only
    }
  ],
  "language": string,       // ISO-ish language name, e.g. "English" or "Hindi"
  "confidence": number,     // 0 to 1
  "summary": string         // one short sentence
}
Rules:
- If the message lists multiple products (bullets •, numbered lists, dashes), put EACH product as a SEPARATE object in "items" with its own quantity and unit.
- NEVER merge a product list into one "items" entry or one long specs.description summary.
- "items" length must equal the number of distinct products requested.
- If only one product is requested, "items" should still have exactly one entry.
- "specs" should mirror the first/primary item for backward compatibility.
- Category values MUST be copied EXACTLY from the allowed list (case-sensitive). Examples: CCTV, DESKTOP, LAPTOP, PRINTER, TFT, NETWORKING, UPS, RAM, HDD, SSD, SERVER, CABLE, Services, Misc.
- Pick the single best category per item from product type (laptop→LAPTOP, desktop/PC→DESKTOP, camera/CCTV→CCTV, printer→PRINTER, monitor/display→TFT, Cat6/patch/HDMI cable→CABLE, etc.).
- Port names on a monitor (HDMI, DisplayPort) do NOT make it CABLE — use TFT.
- "unit" is how the quantity is counted (usually "pcs"), NEVER the product's length/size. Put length/size in "specs" (e.g. specs.length = "2 m", specs.size = "24-inch").
- Patterns like "Cat6 patch cable 2 m x40" mean quantity=40, unit="pcs", specs.length="2 m" — not 40 meters.
- Only use unit "meters"/"m" when the buyer is buying continuous length (e.g. "50 meters of Cat6 cable").
- Use "Misc" only if nothing in the list fits. Never invent labels like "CCTV & Surveillance" or "Computers & Laptops".
- productCategory must be the dominant item category (most common / primary line).
- Do not invent prices or product codes.
- Keep each item "description" in the customer's original wording. Do not rename it to a catalog, SKU, or brand-model name.
- If the message is marketing, promotional, newsletter, SaaS product update, digest, bank alert, or "unsubscribe" mail (not a buyer asking for a quote), set confidence <= 0.2, items: [], and specs.description null.
- confidence < ${PARSE_CONFIDENCE_THRESHOLD} if the message is vague or not a purchase request.
- Only high confidence when a real buyer is requesting products/services with quote intent (RFQ, quotation, qty, purchase need).

Example input:
"quotation for the following products:
• CCTV / IP Cameras – 10 Units
• Desktop PCs – 20 Units
• Business Laptops – 10 Units
• Cat6 patch cable 2 m x40
• 24-inch FHD IPS monitor HDMI+DisplayPort x15"

Example output items (5 entries, NOT one combined line):
[
  {"description":"CCTV / IP Cameras","quantity":10,"unit":"pcs","brand":null,"category":"CCTV","specs":{}},
  {"description":"Desktop PCs","quantity":20,"unit":"pcs","brand":null,"category":"DESKTOP","specs":{}},
  {"description":"Business Laptops","quantity":10,"unit":"pcs","brand":null,"category":"LAPTOP","specs":{}},
  {"description":"Cat6 patch cable 2 m","quantity":40,"unit":"pcs","brand":null,"category":"CABLE","specs":{"length":"2 m"}},
  {"description":"24-inch FHD IPS monitor HDMI+DisplayPort","quantity":15,"unit":"pcs","brand":null,"category":"TFT","specs":{"size":"24-inch"}}
]
For that example, productCategory should be "DESKTOP" (largest qty) or "CCTV"/"LAPTOP" if equally primary — never a made-up label.`;

  const user = `Subject: ${subject || "(none)"}

Message:
${rawText}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "QuoteFlow RFQ Parser",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenRouter response");

  const parsed = extractJson(content) as Partial<ParseRfqResult>;

  let confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  // Hard clamp: promo/newsletter text must never land as a high-confidence RFQ.
  if (looksLikePromotionalEmail({ subject, text: rawText })) {
    confidence = Math.min(confidence, 0.2);
  }
  const specs = (parsed.specs && typeof parsed.specs === "object" ? parsed.specs : {}) as ParsedRfqSpecs;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: ParsedRfqItem[] = rawItems
    .filter((item): item is ParsedRfqItem => !!item && typeof item === "object")
    .map((item) => {
      const description =
        typeof item.description === "string" ? item.description : null;
      const brand = typeof item.brand === "string" ? item.brand : null;
      const rawCategory =
        typeof item.category === "string" ? item.category : null;
      return {
        description,
        brand,
        quantity: typeof item.quantity === "number" ? item.quantity : null,
        unit: typeof item.unit === "string" ? item.unit : null,
        // Infer from this line only — full RFQ text would bleed other products in.
        category: resolveProductCategory(
          rawCategory,
          [description, brand].filter(Boolean).join(" ")
        ),
        specs:
          item.specs && typeof item.specs === "object"
            ? (item.specs as Record<string, string | number | boolean | null>)
            : undefined,
      };
    });

  const aiFallbackItems =
    items.length > 0
      ? items
      : specs.description || specs.brand
        ? [
            {
              description: typeof specs.description === "string" ? specs.description : null,
              brand: typeof specs.brand === "string" ? specs.brand : null,
              quantity: typeof specs.quantity === "number" ? specs.quantity : null,
              unit: typeof specs.unit === "string" ? specs.unit : null,
              category: resolveProductCategory(
                typeof parsed.productCategory === "string"
                  ? parsed.productCategory
                  : null,
                [
                  typeof specs.description === "string" ? specs.description : "",
                  typeof specs.brand === "string" ? specs.brand : "",
                  subject || "",
                ]
                  .filter(Boolean)
                  .join(" ")
              ),
            },
          ]
        : [];

  const resolvedItems = resolveParsedItems(aiFallbackItems, rawText).map((item) => ({
    description: item.description,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    specs: undefined as ParsedRfqItem["specs"],
  }));

  const { items: normalizedItems, productCategory } =
    normalizeParsedItemCategories(
      resolvedItems,
      typeof parsed.productCategory === "string" ? parsed.productCategory : null
    );

  const primaryItem = normalizedItems[0];
  const mergedSpecs: ParsedRfqSpecs = {
    ...specs,
    description: primaryItem?.description ?? specs.description,
    quantity: primaryItem?.quantity ?? specs.quantity,
    unit: primaryItem?.unit ?? specs.unit,
    brand: primaryItem?.brand ?? specs.brand,
    items: normalizedItems,
  };

  return {
    productCategory,
    specs: mergedSpecs,
    items: normalizedItems,
    language: typeof parsed.language === "string" ? parsed.language : "Unknown",
    confidence,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

export function statusFromConfidence(confidence: number): "PARSED" | "NEEDS_REVIEW" {
  return confidence >= PARSE_CONFIDENCE_THRESHOLD ? "PARSED" : "NEEDS_REVIEW";
}
