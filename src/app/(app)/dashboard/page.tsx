import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";

export default async function DashboardPage() {
  const [productCount, quoteCount, rfqCount, recentQuotes] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.quote.count(),
    prisma.rfq.count({ where: { status: { in: ["NEW", "NEEDS_REVIEW", "PARSED"] } } }),
    prisma.quote.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-mid-green">Catalog, inbox, and quotes at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white/50 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <p className="text-sm text-mid-green">Open RFQs</p>
          <p className="mt-2 text-3xl font-semibold">{rfqCount}</p>
          <Link href="/inbox" className="mt-2 inline-block text-sm text-mid-green hover:underline">
            Open inbox →
          </Link>
        </div>
        <div className="rounded-xl bg-white/50 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <p className="text-sm text-mid-green">Active products</p>
          <p className="mt-2 text-3xl font-semibold">{productCount}</p>
        </div>
        <div className="rounded-xl bg-white/50 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <p className="text-sm text-mid-green">Quotes</p>
          <p className="mt-2 text-3xl font-semibold">{quoteCount}</p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/quotes/new" className="text-sm font-medium text-mid-green hover:underline">
              New quote →
            </Link>
            <Link href="/request" className="text-sm font-medium text-mid-green hover:underline">
              Public RFQ form →
            </Link>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent quotes</h2>
          <Link href="/quotes" className="text-sm text-mid-green hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-secondary/5 text-mid-green">
              <tr>
                <th className="px-4 py-3 font-medium">Quote</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-mid-green">
                    No quotes yet. Create your first quote.
                  </td>
                </tr>
              ) : (
                recentQuotes.map((q, i) => (
                  <tr
                    key={q.id}
                    className={i % 2 === 1 ? "bg-light-green/10" : undefined}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`} className="font-medium hover:text-mid-green">
                        {q.quoteNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{q.buyerCompany || q.buyerName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={q.status} />
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
      </section>
    </div>
  );
}
