import {
  vendorPricedLineNumbers,
  vendorsWithPriceForLine,
  type VendorPriceMatch,
} from "@/lib/vendor-line-price";

export type QuoteVendorQuote = {
  vendorId: string;
  vendorName: string;
  unitPrice: number;
  source: string;
};

export type RfqLineVendorQuotes = {
  lineNumber: number;
  description: string;
  options: QuoteVendorQuote[];
};

export function vendorQuotesFromMatches(
  matches: VendorPriceMatch[]
): RfqLineVendorQuotes[] {
  const lineNumbers = [
    ...new Set(matches.flatMap((match) => vendorPricedLineNumbers(match))),
  ].sort((a, b) => a - b);

  return lineNumbers.map((lineNumber) => {
    const options = sortVendorQuotes(
      vendorsWithPriceForLine(matches, lineNumber).map((opt) => ({
        vendorId: opt.vendorId,
        vendorName: opt.vendorName,
        unitPrice: opt.unitPrice,
        source: opt.source,
      }))
    );
    const description =
      matches
        .flatMap((match) => match.matchedLines || [])
        .find((line) => line.lineNumber === lineNumber)?.description ||
      matches
        .flatMap((match) => match.outreach?.quotedLineItems || [])
        .find((line) => line.lineNumber === lineNumber)?.description ||
      "";
    return { lineNumber, description, options };
  });
}

export function sortVendorQuotes(
  options: QuoteVendorQuote[]
): QuoteVendorQuote[] {
  return [...options].sort(
    (a, b) => a.unitPrice - b.unitPrice || a.vendorName.localeCompare(b.vendorName)
  );
}

export function cheapestVendorQuote(
  options: QuoteVendorQuote[]
): QuoteVendorQuote | undefined {
  return sortVendorQuotes(options)[0];
}

export function selectedVendorQuote(
  options: QuoteVendorQuote[],
  costPrice?: number | null,
  costVendorName?: string
): QuoteVendorQuote | undefined {
  const sorted = sortVendorQuotes(options);
  if (sorted.length === 0) return undefined;
  return (
    sorted.find(
      (quote) =>
        quote.vendorName === (costVendorName || "") &&
        (costPrice == null || quote.unitPrice === costPrice)
    ) ||
    sorted.find((quote) => quote.vendorName === (costVendorName || "")) ||
    sorted[0]
  );
}

export function vendorQuotesForQuoteLine(
  line: { aliasName?: string; sortOrder?: number },
  index: number,
  groups: RfqLineVendorQuotes[],
  quoteLineCount: number
): QuoteVendorQuote[] {
  if (groups.length === 0) return [];
  if (groups.length === quoteLineCount) {
    return groups[index]?.options || [];
  }
  const alias = (line.aliasName || "").trim().toLowerCase();
  if (alias) {
    const byDesc = groups.find(
      (group) => group.description.trim().toLowerCase() === alias
    );
    if (byDesc?.options.length) return byDesc.options;
  }
  const lineNumber = (line.sortOrder ?? index) + 1;
  return groups.find((group) => group.lineNumber === lineNumber)?.options || [];
}
