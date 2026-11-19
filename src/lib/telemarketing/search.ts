/** Escape `%`, `_`, and `\` for safe use in SQL LIKE / ILIKE patterns (with ESCAPE '\\'). */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function telemarketingSearchPattern(q: string): string {
  return `%${escapeLikePattern(q)}%`;
}