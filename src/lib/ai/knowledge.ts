import { type Prisma, type KnowledgeSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type KnowledgeHit = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  score: number;
};

const COSINE_THRESHOLD = 0.78;
const EMBEDDING_MODEL = "openai/text-embedding-3-small";

const TAG_PATTERNS: Array<{ tag: string; re: RegExp }> = [
  { tag: "LEAD_TIME", re: /\b(lead time|delivery (date|time|schedule)|eta|when can you (ship|deliver)|how long)\b/i },
  { tag: "PAYMENT_TERMS", re: /\b(payment terms?|advance|credit period|net \d+|against (delivery|pi))\b/i },
  { tag: "GST", re: /\b(gst|cgst|sgst|igst|tax amount|hsn)\b/i },
  { tag: "WARRANTY", re: /\b(warrant(y|ies)|guarantee)\b/i },
  { tag: "STOCK", re: /\b(stock|availability|in hand|ready stock|moq|minimum order)\b/i },
  { tag: "SHIPPING", re: /\b(shipping|freight|packing|incoterms?|transport)\b/i },
  { tag: "INSTALLATION", re: /\b(install(ation)?|commissioning)\b/i },
  { tag: "CERTIFICATE", re: /\b(certificate|test report|datasheet|isi|iso)\b/i },
  { tag: "PRICE", re: /\b(price|rate|discount|breakdown|total|cost)\b/i },
];

export function inferKnowledgeTags(text: string): string[] {
  return TAG_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.tag);
}

export function stripQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^On .+wrote:$/i.test(trimmed)) break;
    if (/^-{2,} ?Original Message ?-{2,}/i.test(trimmed)) break;
    if (/^From:\s.+/i.test(trimmed) && kept.length > 0) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function stripCompanySignature(text: string, companyName?: string): string {
  let out = text.trim();
  if (companyName?.trim()) {
    const marker = `\n\nThanks,\n${companyName.trim()}`;
    const idx = out.lastIndexOf(marker);
    if (idx >= 0) out = out.slice(0, idx).trim();
  }
  out = out.replace(/\n\nThanks,\s*\n[\s\S]+$/, "").trim();
  return out;
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 12);
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const input = text.slice(0, 8000).trim();
  if (!input) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "QuoteFlow Knowledge Embeddings",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    });
    if (!res.ok) {
      console.error("OpenRouter embedding failed:", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    return asNumberArray(data.data?.[0]?.embedding);
  } catch (err) {
    console.error("embedText error:", err);
    return null;
  }
}

async function persistEmbedding(id: string, embedding: number[]) {
  await prisma.knowledgeEntry.update({
    where: { id },
    data: { embedding: embedding as Prisma.InputJsonValue },
  });
}

export async function captureHumanQa(input: {
  question: string;
  answer: string;
  quoteId?: string;
  inboundMessageId?: string;
  createdById?: string;
  source?: KnowledgeSource;
}): Promise<string | null> {
  const question = stripQuotedHistory(input.question).slice(0, 4000).trim();
  const answer = input.answer.slice(0, 8000).trim();
  if (question.length < 8 || answer.length < 8) return null;

  if (input.inboundMessageId) {
    const existing = await prisma.knowledgeEntry.findFirst({
      where: { inboundMessageId: input.inboundMessageId, source: "HUMAN_REPLY" },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const tags = inferKnowledgeTags(`${question}\n${answer}`);
  const row = await prisma.knowledgeEntry.create({
    data: {
      question,
      answer,
      tags,
      source: input.source ?? "HUMAN_REPLY",
      quoteId: input.quoteId,
      inboundMessageId: input.inboundMessageId ?? "",
      createdById: input.createdById,
    },
  });

  void embedText(`${question}\n${answer}`)
    .then((vec) => (vec ? persistEmbedding(row.id, vec) : undefined))
    .catch((err) => console.error("knowledge embed failed:", err));

  return row.id;
}

function keywordScore(
  query: string,
  entry: { question: string; answer: string; tags: string[] },
  queryTags: string[]
): number {
  const tokens = tokenize(query);
  if (tokens.length === 0 && queryTags.length === 0) return 0;
  const hay = `${entry.question} ${entry.answer}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
  }
  const tokenScore = tokens.length ? hits / tokens.length : 0;
  const tagOverlap = queryTags.filter((t) => entry.tags.includes(t)).length;
  const tagScore = queryTags.length ? tagOverlap / queryTags.length : tagOverlap > 0 ? 1 : 0;
  return Math.max(tokenScore, tagScore * 0.9);
}

export async function searchKnowledge(
  query: string,
  options?: { unknownAsks?: string[] }
): Promise<KnowledgeHit[]> {
  const text = stripQuotedHistory(query).trim();
  if (text.length < 4) return [];

  const queryTags = inferKnowledgeTags([text, ...(options?.unknownAsks ?? [])].join("\n"));
  const tokens = tokenize(text);

  const orFilters: Prisma.KnowledgeEntryWhereInput[] = [];
  for (const t of tokens.slice(0, 8)) {
    orFilters.push({ question: { contains: t, mode: "insensitive" } });
    orFilters.push({ answer: { contains: t, mode: "insensitive" } });
  }
  if (queryTags.length) {
    orFilters.push({ tags: { hasSome: queryTags } });
  }

  const keywordRows = await prisma.knowledgeEntry.findMany({
    where: {
      active: true,
      ...(orFilters.length ? { OR: orFilters } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      question: true,
      answer: true,
      tags: true,
      embedding: true,
    },
  });

  const scored = new Map<string, KnowledgeHit>();
  for (const row of keywordRows) {
    const score = keywordScore(text, row, queryTags);
    if (score >= 0.35) {
      scored.set(row.id, {
        id: row.id,
        question: row.question,
        answer: row.answer,
        tags: row.tags,
        score,
      });
    }
  }

  const queryEmbedding = await embedText(text);
  if (queryEmbedding) {
    const withVectors =
      keywordRows.length > 0
        ? keywordRows
        : await prisma.knowledgeEntry.findMany({
            where: { active: true },
            take: 80,
            select: {
              id: true,
              question: true,
              answer: true,
              tags: true,
              embedding: true,
            },
          });

    for (const row of withVectors) {
      const vec = asNumberArray(row.embedding);
      if (!vec) continue;
      const sim = cosineSimilarity(queryEmbedding, vec);
      if (sim < COSINE_THRESHOLD) continue;
      const prev = scored.get(row.id);
      const nextScore = Math.max(prev?.score ?? 0, sim);
      scored.set(row.id, {
        id: row.id,
        question: row.question,
        answer: row.answer,
        tags: row.tags,
        score: nextScore,
      });
    }
  }

  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}

export function formatKnowledgeForPrompt(entries: KnowledgeHit[]): string {
  if (!entries.length) return "(none)";
  return entries
    .map(
      (e, i) =>
        `${i + 1}. Q: ${e.question.slice(0, 400)}\n   A: ${e.answer.slice(0, 800)}${
          e.tags.length ? `\n   Tags: ${e.tags.join(", ")}` : ""
        }`
    )
    .join("\n");
}
