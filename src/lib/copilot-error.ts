/** Friendly copy when OpenRouter or the model fails — no raw JSON in the UI. */
export function userFacingCopilotError(message: string): string {
  const raw = String(message || "").trim();
  if (!raw) return "Quote Agent could not finish. Try again in a moment.";

  if (/402|requires more credits|insufficient.*credit/i.test(raw)) {
    return "Quote Agent is out of AI credits on the provider. Add credits or try again later.";
  }
  if (/429|rate[- ]limit|too many requests/i.test(raw)) {
    return "Quote Agent is temporarily rate-limited. Wait a moment and try again.";
  }
  if (/openrouter|provider returned error|"error"\s*:/i.test(raw) || /^\s*[{[]/.test(raw)) {
    return "Quote Agent hit a provider error. Try again, or ask a catalog question to search the database directly.";
  }
  if (raw.length > 160) {
    return "Quote Agent could not finish. Try again, or rephrase your question.";
  }
  return raw;
}

/** Heuristic: product / SKU / catalog wording without a quote or invoice id. */
export function looksLikeCatalogQuestion(text: string): boolean {
  const q = text.toLowerCase();
  if (q.length < 8) return false;
  if (/\bq-\d|\binvoice\b|\btrial balance\b|\bar ageing\b/i.test(q)) return false;
  return (
    /\bcatalog\b/.test(q) ||
    /\bwhich\b.+\b(have|stock|sell|carry)\b/i.test(q) ||
    /\b\d+\s*port\b/.test(q) ||
    /\bswitch(?:es)?\b/.test(q) ||
    /\bsku\b/.test(q) ||
    /\bproduct(s)?\b/.test(q)
  );
}