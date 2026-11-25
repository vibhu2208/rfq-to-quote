export function parseProductsPageParam(raw: string | null | undefined): number {
  const n = Number(raw || "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function shouldResetProductsPageOnSearch(
  previousDebounced: string,
  nextDebounced: string
): boolean {
  return previousDebounced !== nextDebounced;
}