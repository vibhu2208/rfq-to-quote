import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";

export default async function ProformasPage() {
  const proformas = await prisma.proformaInvoice.findMany({
    include: { party: true, quote: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proforma invoices</h1>
        <p className="mt-1 text-sm text-mid-green">
          Non-posting commercial documents — no GST liability, stock, or journal until converted
        </p>
      </div>
      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Quote</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {proformas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No proformas yet.
                </td>
              </tr>
            ) : (
              proformas.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? "bg-light-green/10" : undefined}>
                  <td className="px-4 py-3">
                    <Link href={`/proformas/${p.id}`} className="font-medium hover:text-mid-green">
                      {p.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.party.legalName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-mid-green">{p.quote?.quoteNumber || "—"}</td>
                  <td className="px-4 py-3 text-mid-green">{format(p.issueDate, "dd MMM yyyy")}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={decimalToNumber(p.total)} />
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
