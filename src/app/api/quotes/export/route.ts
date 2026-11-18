import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";
import { formatQuoteInstant } from "@/lib/quote-format";
import {
  parseQuoteListFilters,
  QUOTE_LIST_EXPORT_LIMIT,
  quoteListCsv,
  quoteListOrderBy,
  quoteListWhere,
} from "@/lib/quote-list";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseQuoteListFilters(params);
  const idList = String(params.ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 500);
  const quotes = await prisma.quote.findMany({
    where:
      idList.length > 0
        ? { id: { in: idList } }
        : quoteListWhere(filters),
    orderBy: quoteListOrderBy(filters),
    take: QUOTE_LIST_EXPORT_LIMIT + 1,
    select: {
      quoteNumber: true,
      quoteName: true,
      buyerCompany: true,
      buyerName: true,
      status: true,
      issuedAt: true,
      updatedAt: true,
      grandTotal: true,
      withGst: true,
    },
  });

  const truncated = quotes.length > QUOTE_LIST_EXPORT_LIMIT;
  const csv = quoteListCsv(
    quotes.slice(0, QUOTE_LIST_EXPORT_LIMIT).map((quote) => ({
      quoteNumber: quote.quoteNumber,
      quoteName: quote.quoteName,
      buyer: quote.buyerCompany || quote.buyerName,
      status: quote.status,
      updated: formatQuoteInstant(quote.issuedAt ?? quote.updatedAt, "yyyy-MM-dd"),
      grandTotal: decimalToNumber(quote.grandTotal),
      withGst: quote.withGst,
    }))
  );
  const body = truncated
    ? `${csv}\n"Export stopped at ${QUOTE_LIST_EXPORT_LIMIT} rows. Narrow the filters to export the rest."`
    : csv;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quotes.csv"`,
    },
  });
}
