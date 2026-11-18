import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";
import { formatQuoteInstant } from "@/lib/quote-format";
import {
  parseQuoteListFilters,
  quoteListCsv,
  quoteListOrderBy,
  quoteListWhere,
} from "@/lib/quote-list";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const filters = parseQuoteListFilters(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  const quotes = await prisma.quote.findMany({
    where: quoteListWhere(filters),
    orderBy: quoteListOrderBy(filters),
    take: 5000,
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

  const csv = quoteListCsv(
    quotes.map((quote) => ({
      quoteNumber: quote.quoteNumber,
      quoteName: quote.quoteName,
      buyer: quote.buyerCompany || quote.buyerName,
      status: quote.status,
      updated: formatQuoteInstant(quote.issuedAt ?? quote.updatedAt, "yyyy-MM-dd"),
      grandTotal: decimalToNumber(quote.grandTotal),
      withGst: quote.withGst,
    }))
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quotes.csv"`,
    },
  });
}
