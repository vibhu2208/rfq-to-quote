import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { QuotesFilters } from "@/components/quotes-filters";
import { QuoteRowActions } from "@/components/quote-row-actions";
import { decimalToNumber } from "@/lib/quotes";
import {
  parseQuoteListFilters,
  quoteListHasFilters,
  quoteListQuery,
  quoteListWhere,
  QUOTE_LIST_PAGE_SIZE,
} from "@/lib/quote-list";
import { format } from "date-fns";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function replyLabel(quote: { lastReplyIntent: string | null; sentAt: Date | null }) {
  if (quote.lastReplyIntent) return quote.lastReplyIntent.replaceAll("_", " ").toLowerCase();
  if (quote.sentAt) return "Awaiting";
  return "";
}

export default async function QuotesPage({ searchParams }: Props) {
  const filters = parseQuoteListFilters(await searchParams);
  const where = quoteListWhere(filters);
  const skip = (filters.page - 1) * QUOTE_LIST_PAGE_SIZE;

  const [quotes, total, needsHelpCount] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: [{ needsAssistance: "desc" }, { updatedAt: "desc" }],
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
        needsAssistance: true,
        lastReplyIntent: true,
        sentAt: true,
        issuedAt: true,
        updatedAt: true,
        grandTotal: true,
        _count: { select: { attachments: true } },
      },
    }),
    prisma.quote.count({ where }),
    prisma.quote.count({ where: { needsAssistance: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / QUOTE_LIST_PAGE_SIZE));
  const filtered = quoteListHasFilters(filters);
  const fromRow = total === 0 ? 0 : skip + 1;
  const toRow = Math.min(skip + quotes.length, total);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white/80 shadow-[0_4px_16px_rgba(11,43,38,0.06)]">
      <QuotesFilters filters={filters} total={total} needsHelpCount={needsHelpCount} />

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col />
            <col />
            <col className="w-[9.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[14.5rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-t border-light-green/20 bg-[#fbfaf6] text-[10px] uppercase tracking-wide text-mid-green">
            <tr>
              <th className="px-3 py-2 font-medium">Quote</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-sm text-mid-green">
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
                      </Link>{" "}
                      or{" "}
                      <Link href="/quotes/new" className="underline">
                        start blank
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              quotes.map((q) => {
                const reply = replyLabel(q);
                return (
                  <tr
                    key={q.id}
                    className={`border-t border-light-green/15 hover:bg-light-green/10 ${
                      q.needsAssistance ? "bg-dark-primary/[0.04]" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <Link href={`/quotes/${q.id}`} className="block min-w-0 hover:text-mid-green">
                        <span className="inline-flex max-w-full items-center gap-1.5">
                          <span className="truncate font-medium">{q.quoteNumber}</span>
                          {q.needsAssistance ? (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-dark-primary/15 text-dark-primary">
                              Assist
                            </span>
                          ) : null}
                        </span>
                        {q.quoteName?.trim() ? (
                          <span className="mt-0.5 block truncate text-xs text-mid-green">
                            {q.quoteName}
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="block truncate" title={q.buyerCompany || q.buyerName || undefined}>
                        {q.buyerCompany || q.buyerName || (
                          <span className="text-mid-green/60">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <StatusBadge status={q.status} />
                      {reply ? (
                        <span className="mt-0.5 block truncate text-[11px] text-mid-green">
                          {reply}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap text-mid-green">
                      {format(q.issuedAt ?? q.updatedAt, "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-2 align-middle text-right font-medium tabular-nums">
                      <Money value={decimalToNumber(q.grandTotal)} />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <QuoteRowActions
                        quote={{
                          id: q.id,
                          quoteNumber: q.quoteNumber,
                          quoteName: q.quoteName,
                          buyerEmail: q.buyerEmail,
                          buyerPhone: q.buyerPhone,
                        }}
                        attachmentCount={q._count.attachments}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        {total > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-light-green/20 px-3 py-2 text-xs text-mid-green">
            <p>
              {fromRow}–{toRow} of {total}
            </p>
            {pageCount > 1 ? (
              <div className="flex gap-1.5">
                {filters.page > 1 ? (
                  <Link
                    href={quoteListQuery(filters, filters.page - 1)}
                    className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70"
                  >
                    Previous
                  </Link>
                ) : null}
                {filters.page < pageCount ? (
                  <Link
                    href={quoteListQuery(filters, filters.page + 1)}
                    className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
    </div>
  );
}
