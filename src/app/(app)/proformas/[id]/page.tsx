import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";
import { ProformaActions } from "@/components/proforma-actions";

type Props = { params: Promise<{ id: string }> };

export default async function ProformaDetailPage({ params }: Props) {
  const { id } = await params;
  const proforma = await prisma.proformaInvoice.findUnique({
    where: { id },
    include: {
      party: true,
      quote: true,
      lines: { orderBy: { lineNumber: "asc" } },
      invoices: true,
    },
  });
  if (!proforma) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/proformas" className="text-sm text-mid-green hover:underline">
            ← Proformas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{proforma.number}</h1>
          <p className="mt-1 text-sm text-mid-green">
            {proforma.party.legalName} · {format(proforma.issueDate, "dd MMM yyyy")}
            {proforma.quote ? ` · Quote ${proforma.quote.quoteNumber}` : ""}
          </p>
        </div>
        <StatusBadge status={proforma.status} />
      </div>

      <ProformaActions
        id={proforma.id}
        status={proforma.status}
        amountPaid={decimalToNumber(proforma.amountPaid)}
        total={decimalToNumber(proforma.total)}
        partyId={proforma.partyId}
        partyName={proforma.party.legalName}
        partyGstin={proforma.party.gstin}
      />

      <div className="overflow-hidden rounded-xl bg-white/40">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {proforma.lines.map((l) => (
              <tr key={l.id} className="border-t border-light-green/20">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right">{decimalToNumber(l.quantity)}</td>
                <td className="px-4 py-2 text-right">
                  <Money value={decimalToNumber(l.lineTotal)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-white/40 p-4 text-sm space-y-1">
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <Money value={decimalToNumber(proforma.total)} />
        </div>
        <div className="flex justify-between text-mid-green">
          <span>Amount paid</span>
          <Money value={decimalToNumber(proforma.amountPaid)} />
        </div>
        {proforma.invoices.length > 0 ? (
          <p className="mt-2 text-mid-green">
            Converted invoices:{" "}
            {proforma.invoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="mr-2 underline">
                {inv.number}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
