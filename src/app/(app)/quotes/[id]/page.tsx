import { notFound } from "next/navigation";
import { QuoteBuilder, type QuoteFormState } from "@/components/quote-builder";
import { QuoteLifecyclePanel } from "@/components/quote-lifecycle-panel";
import { QuoteAccountingActions } from "@/components/quote-accounting-actions";
import { getCompanyConfig } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";
import { normalizeQuoteUnit, quoteLineDetails } from "@/lib/quote-format";
import type { ManualOverrides } from "@/lib/tax";
import { formatQuoteInstant } from "@/lib/quote-format";

type Props = { params: Promise<{ id: string }> };

export default async function EditQuotePage({ params }: Props) {
  const { id } = await params;
  if (id === "new") {
    const company = getCompanyConfig();
    return <QuoteBuilder sellerState={company.sellerState} company={company} />;
  }
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              code: true,
              sourceProductId: true,
              hsnCode: true,
              name: true,
              description: true,
              lastPrice: true,
              offerPrice: true,
              mrp: true,
            },
          },
        },
      },
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
    quoteName: quote.quoteName || "",
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    buyerGstin: quote.buyerGstin,
    withGst: quote.withGst,
    showHsn: quote.showHsn !== false,
    showUnit: quote.showUnit !== false,
    gstMode: (quote.gstMode as QuoteFormState["gstMode"]) || "AUTO",
    deliveryCharge: decimalToNumber(quote.deliveryCharge),
    discountPercent: decimalToNumber(quote.discountPercent),
    discountAmount: decimalToNumber(quote.discountAmount),
    otherTaxAmount: decimalToNumber(quote.otherTaxAmount),
    otherTaxLabel: quote.otherTaxLabel,
    notes: "",
    quoteDate: formatQuoteInstant(quote.issuedAt ?? quote.createdAt, "yyyy-MM-dd"),
    introText: quote.introText || "",
    termsText: quote.termsText || "",
    closingText: quote.closingText || "",
    status: quote.status === "DRAFT" ? "DRAFT" : "SENT",
    manualOverrides: (quote.manualOverrides as ManualOverrides) || {},
    subtotal: decimalToNumber(quote.subtotal),
    gstAmount: decimalToNumber(quote.gstAmount),
    grandTotal: decimalToNumber(quote.grandTotal),
    lineItems: quote.lineItems.map((li) => ({
      key: li.id,
      productId: li.productId,
      description:
        quoteLineDetails(li.aliasName || li.product?.name || "", li.description) ||
        li.product?.description ||
        "",
      aliasName: li.aliasName || li.product?.name || "",
      catalogName: li.product?.name || "",
      catalogCode: li.product?.code || "",
      catalogSourceId: li.product?.sourceProductId || null,
      qty: decimalToNumber(li.qty),
      unit: li.unit,
      unitPrice: decimalToNumber(li.unitPrice),
      costPrice: li.costPrice != null ? decimalToNumber(li.costPrice) : null,
      costVendorName: li.costVendorName || "",
      discountPercent: decimalToNumber(li.discountPercent),
      warrantyQty: li.warrantyQty ?? 0,
      warrantyUnit:
        li.warrantyUnit === "months" || li.warrantyUnit === "days"
          ? li.warrantyUnit
          : "years",
      warrantyService:
        li.warrantyService === "onsite" ||
        li.warrantyService === "offsite" ||
        li.warrantyService === "both"
          ? li.warrantyService
          : "",
      catalogLastPrice: li.product?.lastPrice != null ? decimalToNumber(li.product.lastPrice) : null,
      catalogOfferPrice:
        li.product?.offerPrice != null ? decimalToNumber(li.product.offerPrice) : null,
      catalogMrp: li.product?.mrp != null ? decimalToNumber(li.product.mrp) : null,
      taxRate: decimalToNumber(li.taxRate),
      hsnCode: li.product?.hsnCode || "",
    })),
  };

  const showLifecycle = quote.status !== "DRAFT" || Boolean(quote.sentAt);
  const showAccounting = ["ACCEPTED", "SENT", "INVOICE_GENERATED", "UNDER_NEGOTIATION"].includes(
    quote.status
  );

  return (
    <div className="space-y-4">
      <QuoteBuilder
        initial={initial}
        sellerState={company.sellerState}
        company={company}
        quoteStatus={quote.status}
        lastReplyIntent={quote.lastReplyIntent}
        rfqId={quote.rfqId || undefined}
        sendContext={{
          rfqChannel: quote.rfq?.channel ?? null,
          customerEmail: quote.rfq?.customerEmail,
          customerPhone: quote.rfq?.customerPhone,
        }}
      />
      {showAccounting ? (
        <QuoteAccountingActions quoteId={quote.id} status={quote.status} />
      ) : null}
      {showLifecycle ? <QuoteLifecyclePanel quoteId={quote.id} /> : null}
    </div>
  );
}
