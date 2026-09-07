import { format } from "date-fns";
import type { Quote, QuoteLineItem, Product } from "@prisma/client";
import { getCompanyConfig } from "@/lib/company";
import { decimalToNumber } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/quote-document";

type QuoteForPdf = Quote & {
  lineItems: Array<
    QuoteLineItem & {
      product?: Pick<Product, "code"> | null;
    }
  >;
};

/** Build the quote PDF buffer from a loaded Quote + line items. */
export async function buildQuotePdfBuffer(quote: QuoteForPdf): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const company = getCompanyConfig();
  const buffer = await renderQuotePdf({
    quoteNumber: quote.quoteNumber,
    createdAt: format(quote.createdAt, "dd MMM yyyy"),
    status: quote.status,
    withGst: quote.withGst,
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    notes: quote.notes,
    subtotal: decimalToNumber(quote.subtotal),
    discountAmount: decimalToNumber(quote.discountAmount),
    gstAmount: decimalToNumber(quote.gstAmount),
    cgstAmount: decimalToNumber(quote.cgstAmount),
    sgstAmount: decimalToNumber(quote.sgstAmount),
    igstAmount: decimalToNumber(quote.igstAmount),
    otherTaxAmount: decimalToNumber(quote.otherTaxAmount),
    otherTaxLabel: quote.otherTaxLabel,
    deliveryCharge: decimalToNumber(quote.deliveryCharge),
    grandTotal: decimalToNumber(quote.grandTotal),
    company: {
      name: company.name,
      address: company.address,
      gstin: company.gstin,
      email: company.email,
      phone: company.phone,
    },
    lineItems: quote.lineItems.map((li) => ({
      description: li.description,
      qty: decimalToNumber(li.qty),
      unit: li.unit,
      unitPrice: decimalToNumber(li.unitPrice),
      taxRate: decimalToNumber(li.taxRate),
      lineTotal: decimalToNumber(li.lineTotal),
      productCode: li.product?.code,
    })),
  });

  return { buffer, filename: `${quote.quoteNumber}.pdf` };
}
