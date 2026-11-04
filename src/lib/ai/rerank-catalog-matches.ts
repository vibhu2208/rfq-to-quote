import type { ProductMatch, RequirementMatch } from "@/lib/product-match";
import {
  applyRerankOrder,
  CATALOG_SUGGESTION_LIMIT,
} from "@/lib/product-match";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export type RerankLineInput = {
  line: number;
  requirement: string;
  /** Exact SKU already resolved — skip AI for this line. */
  exact?: boolean;
  candidates: Array<{
    id: string;
    code: string;
    name: string;
    brand: string;
    category: string;
  }>;
};

/**
 * One cheap OpenRouter call: re-rank short candidate lists for all RFQ lines.
 * Returns ordered product ids per lineNumber. On failure, returns {}.
 */
export async function rerankCatalogMatches(
  lines: RerankLineInput[]
): Promise<Record<number, string[]>> {
  const needAi = lines.filter((l) => !l.exact && l.candidates.length > 0);
  if (needAi.length === 0) return {};

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return {};

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const compact = needAi.map((l) => ({
    line: l.line,
    req: l.requirement.slice(0, 220),
    cands: l.candidates.slice(0, 20).map((c, i) => ({
      i,
      id: c.id,
      code: c.code,
      name: c.name,
      brand: c.brand,
      cat: c.category,
    })),
  }));

  const system = `You match buyer RFQ lines to catalog products.
Return ONLY JSON: {"results":[{"line":1,"ids":["catalog-id",...]}]}
Rules:
- Pick the product the buyer is BUYING, not listed features/accessories (e.g. mic, ops, wifi, ssd inside an IFP spec).
- Use only ids from that line's cands.
- Best matches first, max ${CATALOG_SUGGESTION_LIMIT} ids per line.
- If nothing fits, ids: [].`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "QuoteFlow catalog re-rank",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ lines: compact }) },
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
  if (!content) return {};

  const parsed = extractJson(content) as { results?: unknown };
  const out: Record<number, string[]> = {};
  if (!Array.isArray(parsed.results)) return out;

  for (const row of parsed.results) {
    if (!row || typeof row !== "object") continue;
    const r = row as { line?: unknown; ids?: unknown };
    const line = typeof r.line === "number" ? r.line : Number(r.line);
    if (!Number.isFinite(line)) continue;
    const allowed = new Set(
      (needAi.find((l) => l.line === line)?.candidates || []).map((c) => c.id)
    );
    const ids = Array.isArray(r.ids)
      ? r.ids.filter((id): id is string => typeof id === "string" && allowed.has(id))
      : [];
    out[line] = ids.slice(0, CATALOG_SUGGESTION_LIMIT);
  }
  return out;
}

export function buildRerankPayload(itemMatches: RequirementMatch[]): RerankLineInput[] {
  return itemMatches.map((item) => {
    const exact = item.matches.some((m) => m.score >= 1000);
    const req = [
      item.requirement.brand,
      item.requirement.description,
      item.requirement.model,
      item.requirement.code,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      line: item.lineNumber,
      requirement: req,
      exact,
      candidates: item.matches.map((m) => ({
        id: m.product.id,
        code: m.product.code,
        name: m.product.name,
        brand: m.product.brand || "",
        category: m.product.category || "",
      })),
    };
  });
}

/** Apply AI id order per line; fall back to weighted scores. */
export function applyRerankToItemMatches(
  itemMatches: RequirementMatch[],
  rankedByLine: Record<number, string[]>,
  limit = CATALOG_SUGGESTION_LIMIT
): RequirementMatch[] {
  return itemMatches.map((item) => {
    if (item.matches.some((m) => m.score >= 1000)) {
      return { ...item, matches: item.matches.slice(0, limit) };
    }
    const ids = rankedByLine[item.lineNumber];
    const matches: ProductMatch[] = ids
      ? applyRerankOrder(item.matches, ids, limit)
      : item.matches.slice(0, limit);
    return { ...item, matches };
  });
}
