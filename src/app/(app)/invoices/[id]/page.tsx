import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Money, StatusBadge } from "@/components/ui";
import { decimalToNumber } from "@/lib/quotes";
import { format } from "date-fns";
import { InvoiceActions } from "@/components/invoice-actions";

type Props = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      party: true,
      lines: { include: { product: true }, orderBy: { lineNumber: "asc" } },
      proformaInvoice: true,
    },
  });
  if (!invoice) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/invoices" className="text-sm text-mid-green hover:underline">
            ← Invoices
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{invoice.number}</h1>
          <p className="mt-1 text-sm text-mid-green">
            {invoice.party.legalName} · {format(invoice.issueDate, "dd MMM yyyy")} · POS{" "}
            {invoice.placeOfSupplyCode}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <InvoiceActions
        invoiceId={invoice.id}
        status={invoice.status}
        partyId={invoice.partyId}
        partyName={invoice.party.legalName}
        partyGstin={invoice.party.gstin}
      />

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">HSN</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Taxable</th>
              <th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-t border-light-green/20">
                <td className="px-4 py-2">{l.lineNumber}</td>
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2">{l.hsnCode || "—"}</td>
                <td className="px-4 py-2 text-right">{decimalToNumber(l.quantity)}</td>
                <td className="px-4 py-2 text-right">
                  <Money value={decimalToNumber(l.unitPrice)} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={decimalToNumber(l.taxableValue)} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money
                    value={
                      decimalToNumber(l.cgstAmount) +
                      decimalToNumber(l.sgstAmount) +
                      decimalToNumber(l.igstAmount)
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Money value={decimalToNumber(l.lineTotal)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-white/40 p-4">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <Money value={decimalToNumber(invoice.subtotal)} />
          </div>
          <div className="mt-1 flex justify-between">
            <span>Tax</span>
            <Money value={decimalToNumber(invoice.taxAmount)} />
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>Total</span>
            <Money value={decimalToNumber(invoice.total)} />
          </div>
          <div className="mt-1 flex justify-between text-mid-green">
            <span>Balance due</span>
            <Money value={decimalToNumber(invoice.balanceDue)} />
          </div>
        </div>
        {invoice.proformaInvoice ? (
          <div className="rounded-xl bg-white/40 p-4 text-mid-green">
            From proforma{" "}
            <Link className="underline" href={`/proformas/${invoice.proformaInvoice.id}`}>
              {invoice.proformaInvoice.number}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
