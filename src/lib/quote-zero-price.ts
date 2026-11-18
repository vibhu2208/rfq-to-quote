import { effectiveUnitPrice } from "@/lib/quote-discount";

export type ZeroPricedLineInput = {
  aliasName?: string | null;
  description?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  discountPercent?: number | null;
};

export type ZeroPricedLine = { name: string };

function lineLabel(line: ZeroPricedLineInput, index: number): string {
  const raw = (line.aliasName || line.description || "").replace(/\s+/g, " ").trim();
  const short = raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
  return short ? `Line ${index + 1}: ${short}` : `Line ${index + 1}`;
}

/** Lines that would print a zero unit rate. Empty placeholder rows are ignored. */
export function zeroPricedQuoteLines(lines: ZeroPricedLineInput[]): ZeroPricedLine[] {
  const flagged: ZeroPricedLine[] = [];
  lines.forEach((line, index) => {
    const name = (line.aliasName || line.description || "").trim();
    // Unnamed placeholder rows (including a blank qty-1 line) are not a priced export.
    if (!name) return;
    const net = effectiveUnitPrice(Number(line.unitPrice) || 0, line.discountPercent);
    if (net > 0) return;
    flagged.push({ name: lineLabel(line, index) });
  });
  return flagged;
}

export function zeroPricedExportMessage(lines: ZeroPricedLine[]): string {
  const shown = lines.slice(0, 6);
  const extra = lines.length - shown.length;
  const list = shown.map((line) => `• ${line.name}`).join("\n");
  const more = extra > 0 ? `\n• ${extra} more` : "";
  const noun = lines.length === 1 ? "line" : "lines";
  return `This PDF includes ${lines.length} zero-priced ${noun}:\n${list}${more}\n\nZero rates are allowed. Continue with the PDF?`;
}

/**
 * Ask before a final PDF download or print. Returns true when there is nothing
 * to flag or the user confirms. Does not block ₹0 lines by itself.
 */
export function confirmZeroPricedExport(
  lines: ZeroPricedLineInput[],
  confirmFn: (message: string) => boolean
): boolean {
  const flagged = zeroPricedQuoteLines(lines);
  if (flagged.length === 0) return true;
  return confirmFn(zeroPricedExportMessage(flagged));
}
