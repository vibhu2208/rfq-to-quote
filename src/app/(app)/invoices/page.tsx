import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    include: { party: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tax invoices</h1>
        <p className="mt-1 text-sm text-mid-green">
          Issued sales invoices with GST, inventory, and ledger posting
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium text-right">Balance</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No invoices yet. Convert an accepted quote or proforma.
                </td>
              </tr>
            ) : (
              invoices.map((inv, i) => (
                <tr key={inv.id} className={i % 2 === 1 ? "bg-light-green/10" : undefined}>
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:text-mid-green">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.party.legalName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-mid-green">
                    {format(inv.issueDate, "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={decimalToNumber(inv.balanceDue)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={decimalToNumber(inv.total)} />
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
