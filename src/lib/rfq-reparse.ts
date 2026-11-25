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

function descriptionKey(description: unknown): string {
  return String(description || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type ProductSelectionsShape = {
  lineSelection?: Record<string, string>;
  lineVendorSelection?: Record<string, string>;
  selectedIds?: string[];
  extras?: Array<{ lineNumber?: number; product: { id: string } }>;
  addedLines?: Array<{ lineNumber: number; description: string }>;
};

/** Carry catalog picks forward when requirement wording still matches after re-parse. */
export function preserveProductSelectionsOnReparse(
  current: unknown,
  previousItems: unknown[],
  nextItems: unknown[]
): ProductSelectionsShape | null {
  if (!current || typeof current !== "object") return null;
  const sel = current as ProductSelectionsShape;

  const lineForDescription = new Map<string, number>();
  nextItems.forEach((row, index) => {
    const key = descriptionKey(
      row && typeof row === "object"
        ? (row as { description?: unknown }).description
        : ""
    );
    if (key) lineForDescription.set(key, index + 1);
  });

  const lineSelection: Record<string, string> = {};
  for (const [lineStr, productId] of Object.entries(sel.lineSelection || {})) {
    const oldLine = Number(lineStr);
    if (!Number.isFinite(oldLine)) continue;
    const oldRow = previousItems[oldLine - 1];
    const key = descriptionKey(
      oldRow && typeof oldRow === "object"
        ? (oldRow as { description?: unknown }).description
        : ""
    );
    const newLine = key ? lineForDescription.get(key) : undefined;
    if (newLine) lineSelection[String(newLine)] = productId;
  }

  const lineVendorSelection: Record<string, string> = {};
  for (const [lineStr, vendorId] of Object.entries(sel.lineVendorSelection || {})) {
    const oldLine = Number(lineStr);
    if (!Number.isFinite(oldLine)) continue;
    const oldRow = previousItems[oldLine - 1];
    const key = descriptionKey(
      oldRow && typeof oldRow === "object"
        ? (oldRow as { description?: unknown }).description
        : ""
    );
    const newLine = key ? lineForDescription.get(key) : undefined;
    if (newLine) lineVendorSelection[String(newLine)] = vendorId;
  }

  const addedLines = (sel.addedLines || [])
    .map((row) => {
      const key = descriptionKey(row.description);
      const lineNumber = key ? lineForDescription.get(key) : undefined;
      return lineNumber ? { ...row, lineNumber } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const productIds = new Set(Object.values(lineSelection));
  for (const extra of sel.extras || []) {
    if (extra.product?.id) productIds.add(extra.product.id);
  }
  const selectedIds = [...productIds];

  if (
    Object.keys(lineSelection).length === 0 &&
    Object.keys(lineVendorSelection).length === 0 &&
    addedLines.length === 0 &&
    !(sel.extras?.length ?? 0)
  ) {
    return null;
  }

  return {
    ...sel,
    lineSelection: Object.keys(lineSelection).length ? lineSelection : sel.lineSelection,
    lineVendorSelection: Object.keys(lineVendorSelection).length
      ? lineVendorSelection
      : sel.lineVendorSelection,
    selectedIds: selectedIds.length ? selectedIds : sel.selectedIds,
    addedLines: addedLines.length ? addedLines : sel.addedLines,
  };
}