import { prisma } from "@/lib/prisma";
import { rankProductsByQuery, searchTokens } from "@/lib/product-search";

const CATALOG_CAP = 80;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function searchCatalogWithAi(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const tokens = searchTokens(q);
  const tokenOr = tokens.map((token) => ({
    OR: [
      { name: { contains: token, mode: "insensitive" as const } },
      { code: { contains: token, mode: "insensitive" as const } },
      { brand: { contains: token, mode: "insensitive" as const } },
      { modelNo: { contains: token, mode: "insensitive" as const } },
      { description: { contains: token, mode: "insensitive" as const } },
      { category: { contains: token, mode: "insensitive" as const } },
    ],
  }));

  const pool = await prisma.product.findMany({
    where: {
      active: true,
      ...(tokenOr.length ? { OR: tokenOr } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      modelNo: true,
      category: true,
      description: true,
    },
    take: 400,
  });

  const ranked = rankProductsByQuery(pool, q).slice(0, CATALOG_CAP);
  if (ranked.length === 0) return [];

  const catalog = ranked.map((p, i) => ({
    i,
    id: p.id,
    code: p.code,
    name: p.name,
    brand: p.brand || "",
    model: p.modelNo || "",
    category: p.category || "",
  }));

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const system = `You match a buyer's product requirement to a catalog.
Return ONLY JSON: {"ids":["catalog-id",...]}
Rules:
- Use only ids from the catalog list.
- Best matches first, max 8.
- If nothing fits, return {"ids":[]}.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "QuoteFlow catalog search",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Requirement: ${q}\nCatalog: ${JSON.stringify(catalog)}`,
        },
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
  if (!content) return ranked.slice(0, 8).map((p) => p.id);

  const parsed = extractJson(content) as { ids?: unknown };
  const allowed = new Set(ranked.map((p) => p.id));
  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((id): id is string => typeof id === "string" && allowed.has(id))
    : [];
  return ids.slice(0, 8);
}
