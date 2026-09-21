import type { RfqRequirementItem } from "@/lib/rfq-items";
import {
  parseIndianWordAmount,
  parseVendorLinePrices,
  type VendorQuotedLineItem,
} from "@/lib/parse-vendor-price";
import { stripEmailQuotedHistory } from "@/lib/vendor-price-apply";

export type VendorReplyParseResult = {
  lines: VendorQuotedLineItem[];
  total: number | null;
  currency: string;
  confidence: number;
  summary: string;
  source: "ai" | "regex";
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

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const indian = parseIndianWordAmount(value);
    if (indian != null) return indian;
    // Avoid stripping words like "lakh" down to concatenated digits ("4 lakh 28" → 428).
    if (/\b(lakh|lac|crore|cr|thousand)\b/i.test(value)) return null;
    const n = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeAiLines(
  rawLines: unknown,
  items: RfqRequirementItem[]
): VendorQuotedLineItem[] {
  if (!Array.isArray(rawLines)) return [];

  const byLine = new Map<number, VendorQuotedLineItem>();

  for (const row of rawLines) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    let lineNumber = Number(r.lineNumber);
    if (!Number.isFinite(lineNumber) || lineNumber < 1) continue;

    const unitPrice = asNumber(r.unitPrice);
    if (unitPrice == null) continue;

    let item = items.find((i) => i.lineNumber === lineNumber);
    if (!item && typeof r.description === "string") {
      const desc = r.description.toLowerCase();
      item =
        items.find((i) => {
          const d = i.description.toLowerCase();
          return d.includes(desc.slice(0, 20)) || desc.includes(d.slice(0, 20));
        }) || undefined;
      if (item) lineNumber = item.lineNumber;
    }

    const description =
      (typeof r.description === "string" && r.description.trim()) ||
      item?.description ||
      `Line ${lineNumber}`;
    const quantity =
      asNumber(r.quantity) ||
      item?.quantity ||
      1;
    const unit =
      (typeof r.unit === "string" && r.unit.trim()) ||
      item?.unit ||
      "pcs";
    const lineTotal = asNumber(r.lineTotal) ?? unitPrice * quantity;

    byLine.set(lineNumber, {
      lineNumber,
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal,
    });
  }

  // Fill any missing RFQ lines that AI skipped but we can map by order
  if (items.length > 0 && byLine.size > 0 && byLine.size < items.length) {
    for (const item of items) {
      if (byLine.has(item.lineNumber)) continue;
    }
  }

  return [...byLine.values()].sort((a, b) => a.lineNumber - b.lineNumber);
}

/**
 * Use AI to understand a vendor Recore reply and extract per-line INR prices.
 * Falls back to deterministic regex parsing if AI is unavailable or low-confidence.
 */
export async function parseVendorReplyWithAi(input: {
  replyText: string;
  subject?: string;
  items: RfqRequirementItem[];
  vendorName?: string;
}): Promise<VendorReplyParseResult> {
  const cleanText = stripEmailQuotedHistory(input.replyText) || input.replyText;
  const regexFallback = (): VendorReplyParseResult => {
    const parsed = parseVendorLinePrices(cleanText, input.items);
    return {
      lines: parsed.lines,
      total: parsed.total,
      currency: "INR",
      confidence: parsed.lines.length > 0 || parsed.total != null ? 0.55 : 0,
      summary:
        parsed.lines.length > 0
          ? `Regex extracted ${parsed.lines.length} line price(s).`
          : parsed.total != null
            ? `Regex extracted total ₹${parsed.total}.`
            : "No prices found.",
      source: "regex",
    };
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return regexFallback();

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const requested = input.items.map((item) => ({
    lineNumber: item.lineNumber,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
  }));

  const system = `You extract vendor quotation prices from reply emails to a Recore / RFQ quote request.
Return ONLY valid JSON with this exact shape:
{
  "lines": [
    {
      "lineNumber": number,          // MUST match a requested lineNumber when possible
      "description": string,         // product the vendor is quoting
      "quantity": number,            // usually the requested qty
      "unit": string,
      "unitPrice": number,           // INR price PER UNIT (not line total)
      "lineTotal": number|null       // unitPrice * quantity if known
    }
  ],
  "total": number|null,             // grand total INR if stated or sum of line totals
  "currency": "INR",
  "confidence": number,             // 0 to 1
  "summary": string                 // one short sentence
}
Rules:
- Map each quoted product to the closest requested lineNumber (use the lineNumber from requested items, even if numbering is not 1..N).
- unitPrice is ALWAYS per-unit INR. If vendor only gave a line/basket total, divide by quantity.
- Convert Indian word amounts to numbers: "4 lakh 28 thousand" or "4lakh 28 thousand" = 428000; "4.28 lakh" = 428000; "1 crore" = 10000000. Never concatenate digits from words (do NOT turn "4 lakh 28" into 428).
- Include EVERY line the vendor priced. Omit lines with no price.
- Do not invent prices. If the reply has no prices, return lines: [] and total: null with low confidence.
- Prefer INR. Strip ₹, Rs, commas.
- IGNORE quoted/forwarded history (lines starting with >, "On ... wrote", old emails). Only read the vendor's new message.
- Percentages like 10% or 3% are NOT unit prices.
- Years like 2026 are NOT unit prices.
- Ignore shipping/tax footnotes unless they are clearly the only quoted amount for a line.
- If vendor gives one lump-sum for the whole basket and items.length > 1, put it in total and leave lines empty OR distribute only if vendor clearly itemized.
- If vendor gives one lump-sum for a single requested line with quantity > 1 (e.g. "the price will be 4 lakh 28 thousand"), treat that as lineTotal and set unitPrice = total / quantity.
- If the vendor only says OK / agreed / will give the discount with NO new numbers, return lines: [] and total: null.`;

  const user = `Vendor: ${input.vendorName || "(unknown)"}
Subject: ${input.subject || "(none)"}

Requested items (JSON):
${JSON.stringify(requested, null, 2)}

Vendor reply email (quoted history already stripped when possible):
${cleanText.slice(0, 12000)}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Vendor Reply Parser",
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
      console.error("Vendor reply AI parse failed:", res.status, errText.slice(0, 300));
      return regexFallback();
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return regexFallback();

    const parsed = extractJson(content) as {
      lines?: unknown;
      total?: unknown;
      currency?: unknown;
      confidence?: unknown;
      summary?: unknown;
    };

    let lines = normalizeAiLines(parsed.lines, input.items);
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    let total = asNumber(parsed.total);
    if (total == null && lines.length > 0) {
      total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    }

    // Single requested line + lump-sum total only → derive unit price.
    if (lines.length === 0 && total != null && input.items.length === 1) {
      const item = input.items[0];
      const quantity = item.quantity || 1;
      const unitPrice =
        quantity > 1
          ? Math.round((total / quantity) * 100) / 100
          : total;
      lines = [
        {
          lineNumber: item.lineNumber,
          description: item.description,
          quantity,
          unit: item.unit,
          unitPrice,
          lineTotal: quantity > 1 ? total : unitPrice * quantity,
        },
      ];
    }

    // If AI found nothing useful, try regex (handles "4 lakh 28 thousand", etc.).
    if (lines.length === 0 && total == null) {
      const fallback = regexFallback();
      if (fallback.lines.length > 0 || fallback.total != null) return fallback;
      return {
        lines: [],
        total: null,
        currency: "INR",
        confidence,
        summary:
          typeof parsed.summary === "string"
            ? parsed.summary
            : "AI found no prices in the vendor reply.",
        source: "ai",
      };
    }

    // Low-confidence AI with empty lines — merge regex if stronger.
    if (confidence < 0.4 && lines.length === 0) {
      const fallback = regexFallback();
      if (fallback.lines.length > 0 || fallback.total != null) return fallback;
    }

    return {
      lines,
      total,
      currency: typeof parsed.currency === "string" ? parsed.currency : "INR",
      confidence,
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : `Extracted ${lines.length} priced line(s).`,
      source: "ai",
    };
  } catch (error) {
    console.error("Vendor reply AI parse error:", error);
    return regexFallback();
  }
}
