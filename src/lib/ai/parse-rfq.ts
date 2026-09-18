import { PRODUCT_CATEGORIES, PARSE_CONFIDENCE_THRESHOLD } from "@/lib/categories";
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
- Prefer the closest category from the list; use "General / Uncategorized" only if nothing fits.
- Do not invent prices or product codes.
- confidence < ${PARSE_CONFIDENCE_THRESHOLD} if the message is vague or not a purchase request.

Example input:
"quotation for the following products:
• CCTV / IP Cameras – 10 Units
• Desktop PCs – 20 Units
• Business Laptops – 10 Units"

Example output items (3 entries, NOT one combined line):
[
  {"description":"CCTV / IP Cameras","quantity":10,"unit":"pcs","brand":null,"category":"CCTV & Surveillance","specs":{}},
  {"description":"Desktop PCs","quantity":20,"unit":"pcs","brand":null,"category":"Computers & Laptops","specs":{}},
  {"description":"Business Laptops","quantity":10,"unit":"pcs","brand":null,"category":"Computers & Laptops","specs":{}}
]`;

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
  const category =
    typeof parsed.productCategory === "string" &&
    (PRODUCT_CATEGORIES as readonly string[]).includes(parsed.productCategory)
      ? parsed.productCategory
      : "General / Uncategorized";

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const specs = (parsed.specs && typeof parsed.specs === "object" ? parsed.specs : {}) as ParsedRfqSpecs;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: ParsedRfqItem[] = rawItems
    .filter((item): item is ParsedRfqItem => !!item && typeof item === "object")
    .map((item) => ({
      description: typeof item.description === "string" ? item.description : null,
      brand: typeof item.brand === "string" ? item.brand : null,
      quantity: typeof item.quantity === "number" ? item.quantity : null,
      unit: typeof item.unit === "string" ? item.unit : null,
      category:
        typeof item.category === "string" &&
        (PRODUCT_CATEGORIES as readonly string[]).includes(item.category)
          ? item.category
          : null,
      specs:
        item.specs && typeof item.specs === "object"
          ? (item.specs as Record<string, string | number | boolean | null>)
          : undefined,
    }));

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
              category,
            },
          ]
        : [];

  const normalizedItems = resolveParsedItems(aiFallbackItems, rawText).map((item) => ({
    description: item.description,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    category:
      item.category &&
      (PRODUCT_CATEGORIES as readonly string[]).includes(item.category)
        ? item.category
        : null,
    specs: undefined as ParsedRfqItem["specs"],
  }));

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
    productCategory: category,
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
