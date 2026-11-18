import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { QuotesFilters } from "@/components/quotes-filters";
import { QuotesListTable, type QuotesListRow } from "@/components/quotes-list-table";
import { decimalToNumber } from "@/lib/quotes";
import {
  parseQuoteListFilters,
  quoteListHasFilters,
  quoteListOrderBy,
  quoteListWhere,
  QUOTE_LIST_PAGE_SIZE,
} from "@/lib/quote-list";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuotesPage({ searchParams }: Props) {
  const filters = parseQuoteListFilters(await searchParams);
  const where = quoteListWhere(filters);
  const skip = (filters.page - 1) * QUOTE_LIST_PAGE_SIZE;

  const [quotes, total, needsHelpCount, totalValue] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: quoteListOrderBy(filters),
      skip,
      take: QUOTE_LIST_PAGE_SIZE,
      select: {
        id: true,
        quoteNumber: true,
        quoteName: true,
        status: true,
        buyerCompany: true,
        buyerName: true,
        buyerEmail: true,
        buyerPhone: true,
        buyerAddress: true,
        buyerState: true,
        needsAssistance: true,
        lastReplyIntent: true,
        sentAt: true,
        issuedAt: true,
        updatedAt: true,
        grandTotal: true,
        _count: { select: { attachments: true } },
        lineItems: {
          orderBy: { sortOrder: "asc" },
          select: {
            aliasName: true,
            description: true,
            qty: true,
            unitPrice: true,
            discountPercent: true,
          },
        },
      },
    }),
    prisma.quote.count({ where }),
    prisma.quote.count({ where: { needsAssistance: true } }),
    prisma.quote.aggregate({ where, _sum: { grandTotal: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / QUOTE_LIST_PAGE_SIZE));
  const filtered = quoteListHasFilters(filters);
  const fromRow = total === 0 ? 0 : skip + 1;
  const toRow = Math.min(skip + quotes.length, total);
  const filteredTotal = decimalToNumber(totalValue._sum.grandTotal);

  const rows: QuotesListRow[] = quotes.map((q) => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    quoteName: q.quoteName,
    status: q.status,
    buyerCompany: q.buyerCompany,
    buyerName: q.buyerName,
    buyerEmail: q.buyerEmail,
    buyerPhone: q.buyerPhone,
    buyerAddress: q.buyerAddress,
    buyerState: q.buyerState,
    needsAssistance: q.needsAssistance,
    lastReplyIntent: q.lastReplyIntent,
    sentAt: q.sentAt?.toISOString() ?? null,
    issuedAt: q.issuedAt?.toISOString() ?? null,
    updatedAt: q.updatedAt.toISOString(),
    grandTotal: decimalToNumber(q.grandTotal),
    attachmentCount: q._count.attachments,
    lines: q.lineItems.map((line) => ({
      aliasName: line.aliasName,
      description: line.description,
      qty: decimalToNumber(line.qty),
      unitPrice: decimalToNumber(line.unitPrice),
      discountPercent: decimalToNumber(line.discountPercent),
    })),
  }));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
      <QuotesFilters filters={filters} total={total} needsHelpCount={needsHelpCount} />

      {quotes.length === 0 ? (
        <QuotesEmptyState filtered={filtered} />
      ) : (
        <QuotesListTable
          quotes={rows}
          filters={filters}
          total={total}
          filteredTotal={filteredTotal}
          fromRow={fromRow}
          toRow={toRow}
          pageCount={pageCount}
        />
      )}
    </div>
  );
}

function QuotesEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-3 py-12 text-center text-sm text-mid-green">
      {filtered ? (
        <>
          No quotes match these filters.{" "}
          <Link href="/quotes" className="underline">
            Clear search
          </Link>
        </>
      ) : (
        <>
          No quotes yet.{" "}
          <Link href="/quotes/generate" className="underline">
            Generate from a requirement
          </Link>
          ,{" "}
          <Link href="/quotes/new" className="underline">
            start blank
          </Link>
          , or use New → Import CSV / Excel.
        </>
      )}
    </div>
  );
}
