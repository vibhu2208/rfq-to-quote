/** Keep a lead's category on re-parse when one was already stored. */
export function retainLeadParsedCategory(
  current: string | null | undefined,
  fromParse: string | null | undefined
): string | null {
  const kept = current?.trim();
  if (kept) return kept;
  const next = fromParse?.trim();
  return next || null;
}