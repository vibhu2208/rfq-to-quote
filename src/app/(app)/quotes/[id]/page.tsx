import { notFound } from "next/navigation";
import { QuoteBuilder, type QuoteFormState } from "@/components/quote-builder";
import { getCompanyConfig } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";
import type { ManualOverrides } from "@/lib/tax";

type Props = { params: Promise<{ id: string }> };

export default async function EditQuotePage({ params }: Props) {
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      rfq: {
        select: {
          channel: true,
          customerEmail: true,
          customerPhone: true,
        },
      },
    },
  });
  if (!quote) notFound();

  const company = getCompanyConfig();
  const initial: QuoteFormState = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    withGst: quote.withGst,
    gstMode: (quote.gstMode as QuoteFormState["gstMode"]) || "AUTO",
    deliveryCharge: decimalToNumber(quote.deliveryCharge),
    discountPercent: decimalToNumber(quote.discountPercent),
    discountAmount: decimalToNumber(quote.discountAmount),
    otherTaxAmount: decimalToNumber(quote.otherTaxAmount),
    otherTaxLabel: quote.otherTaxLabel,
    notes: quote.notes,
    status: quote.status === "SENT" ? "SENT" : "DRAFT",
    manualOverrides: (quote.manualOverrides as ManualOverrides) || {},
    subtotal: decimalToNumber(quote.subtotal),
    gstAmount: decimalToNumber(quote.gstAmount),
    grandTotal: decimalToNumber(quote.grandTotal),
    lineItems: quote.lineItems.map((li) => ({
      key: li.id,
      productId: li.productId,
      description: li.description,
      qty: decimalToNumber(li.qty),
      unit: li.unit,
      unitPrice: decimalToNumber(li.unitPrice),
      taxRate: decimalToNumber(li.taxRate),
    })),
  };

  return (
    <QuoteBuilder
      initial={initial}
      sellerState={company.sellerState}
      sendContext={{
        rfqChannel: quote.rfq?.channel ?? null,
        customerEmail: quote.rfq?.customerEmail,
        customerPhone: quote.rfq?.customerPhone,
      }}
    />
  );
}
