/** Split a user query into searchable tokens (whitespace-separated, lowercased). */
export function searchTokens(q: string): string[] {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Relevance score for catalog search — prefers product name matches over code/description.
 * Higher is better.
 */
export function scoreProductSearchHit(
  product: { code: string; name: string; description: string },
  q: string,
  tokens: string[]
): number {
  const name = product.name.toLowerCase();
  const code = product.code.toLowerCase();
  const desc = (product.description || "").toLowerCase();
  const ql = q.toLowerCase().trim();
  if (!ql) return 0;

  let score = 0;

  // Full-phrase name matches (strongest signal)
  if (name === ql) score += 200;
  else if (name.startsWith(ql)) score += 140;
  else if (name.includes(ql)) score += 100;

  if (code === ql) score += 160;
  else if (code.startsWith(ql)) score += 90;
  else if (code.includes(ql)) score += 50;

  if (desc.includes(ql)) score += 20;

  // Per-token hits (multi-word queries like "dell 16gb")
  for (const t of tokens) {
    if (name === t) score += 40;
    else if (name.startsWith(t)) score += 28;
    else if (name.includes(t)) score += 22;

    if (code === t || code.startsWith(t)) score += 18;
    else if (code.includes(t)) score += 12;

    if (desc.includes(t)) score += 4;
  }

  // Prefer shorter names when scores tie-ish (more specific catalog titles)
  score += Math.max(0, 30 - Math.min(name.length, 30));

  return score;
}

/** Sort products by search relevance for query `q`. */
export function rankProductsByQuery<T extends { code: string; name: string; description: string }>(
  products: T[],
  q: string
): T[] {
  const trimmed = q.trim();
  if (!trimmed) return products;
  const tokens = searchTokens(trimmed);
  return [...products].sort((a, b) => {
    const diff = scoreProductSearchHit(b, trimmed, tokens) - scoreProductSearchHit(a, trimmed, tokens);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}
