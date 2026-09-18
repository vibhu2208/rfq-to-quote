import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";

export default async function QuotesPage() {
  const quotes = await prisma.quote.findMany({
    orderBy: [{ needsAssistance: "desc" }, { updatedAt: "desc" }],
  });

  const needsHelpCount = quotes.filter((q) => q.needsAssistance).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quotes</h1>
          <p className="mt-1 text-sm text-mid-green">
            Draft, send, and track quotation lifecycle
            {needsHelpCount > 0
              ? ` · ${needsHelpCount} need${needsHelpCount === 1 ? "s" : ""} manual assistance`
              : ""}
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
        >
          New quote
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Buyer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reply</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No quotes yet.{" "}
                  <Link href="/quotes/new" className="underline">
                    Create one
                  </Link>
                </td>
              </tr>
            ) : (
              quotes.map((q, i) => (
                <tr
                  key={q.id}
                  className={
                    q.needsAssistance
                      ? "bg-dark-primary/8"
                      : i % 2 === 1
                        ? "bg-light-green/10"
                        : undefined
                  }
                >
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${q.id}`} className="font-medium hover:text-mid-green">
                      {q.quoteNumber}
                    </Link>
                    {q.needsAssistance ? (
                      <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-dark-primary/15 text-dark-primary">
                        Assist
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{q.buyerCompany || q.buyerName || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={q.status} />
                  </td>
                  <td className="px-4 py-3 text-mid-green">
                    {q.lastReplyIntent
                      ? q.lastReplyIntent.replaceAll("_", " ").toLowerCase()
                      : q.sentAt
                        ? "Awaiting"
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-mid-green">
                    {format(q.updatedAt, "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={decimalToNumber(q.grandTotal)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
