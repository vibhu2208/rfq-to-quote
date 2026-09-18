import { format } from "date-fns";
import type { Quote, QuoteLineItem, Product } from "@prisma/client";
import { getCompanyConfig } from "@/lib/company";
import { round2 } from "@/lib/accounting/money";
import { decimalToNumber } from "@/lib/quotes";
import { renderQuotePdf } from "@/lib/pdf/quote-document";

type QuoteForPdf = Quote & {
  lineItems: Array<
    QuoteLineItem & {
      product?: Pick<Product, "code" | "hsnCode"> | null;
    }
  >;
};

/** Build the quote PDF buffer from a loaded Quote + line items. */
export async function buildQuotePdfBuffer(quote: QuoteForPdf): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const company = getCompanyConfig();
  const withGst = quote.withGst;

  const buffer = await renderQuotePdf({
    quoteNumber: quote.quoteNumber,
    createdAt: format(quote.createdAt, "dd/MM/yyyy"),
    status: quote.status,
    withGst,
    buyerName: quote.buyerName,
    buyerCompany: quote.buyerCompany,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    buyerState: quote.buyerState,
    buyerAddress: quote.buyerAddress,
    buyerGstin: quote.buyerGstin || undefined,
    notes: quote.notes,
    paymentTerms: company.paymentTerms,
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
      mobile: company.mobile,
      website: company.website,
      signatory: company.signatory,
      bankName: company.bankName,
      bankBranch: company.bankBranch,
      bankIfsc: company.bankIfsc,
      bankAccount: company.bankAccount,
      bankAccountType: company.bankAccountType,
    },
    lineItems: quote.lineItems.map((li) => {
      const qty = decimalToNumber(li.qty);
      const unitPrice = decimalToNumber(li.unitPrice);
      const taxRate = decimalToNumber(li.taxRate);
      const taxable = round2(qty * unitPrice);
      const taxAmount = withGst ? round2((taxable * taxRate) / 100) : 0;
      return {
        description: li.description,
        aliasName: li.aliasName || "",
        qty,
        unit: li.unit,
        unitPrice,
        taxRate,
        lineTotal: taxable,
        taxAmount,
        amount: round2(taxable + taxAmount),
        hsnCode: li.product?.hsnCode ?? undefined,
        productCode: li.product?.code,
      };
    }),
  });

  return { buffer, filename: `${quote.quoteNumber}.pdf` };
}
