import { PRODUCT_CATEGORIES, PARSE_CONFIDENCE_THRESHOLD } from "@/lib/categories";

export type ParsedRfqSpecs = {
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  budget?: number | null;
  currency?: string | null;
  description?: string | null;
  specs?: Record<string, string | number | boolean | null>;
  [key: string]: unknown;
};

export type ParseRfqResult = {
  productCategory: string;
  specs: ParsedRfqSpecs;
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
  "productCategory": string,  // MUST be one of: ${categories}
  "specs": {
    "brand": string|null,
    "quantity": number|null,
    "unit": string|null,
    "budget": number|null,
    "currency": string|null,
    "description": string|null,
    "specs": { }  // extra key/value product attributes
  },
  "language": string,       // ISO-ish language name, e.g. "English" or "Hindi"
  "confidence": number,     // 0 to 1
  "summary": string         // one short sentence
}
Rules:
- Prefer the closest category from the list; use "General / Uncategorized" only if nothing fits.
- Do not invent prices or product codes.
- confidence < ${PARSE_CONFIDENCE_THRESHOLD} if the message is vague or not a purchase request.`;

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

  return {
    productCategory: category,
    specs: (parsed.specs && typeof parsed.specs === "object" ? parsed.specs : {}) as ParsedRfqSpecs,
    language: typeof parsed.language === "string" ? parsed.language : "Unknown",
    confidence,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

export function statusFromConfidence(confidence: number): "PARSED" | "NEEDS_REVIEW" {
  return confidence >= PARSE_CONFIDENCE_THRESHOLD ? "PARSED" : "NEEDS_REVIEW";
}
