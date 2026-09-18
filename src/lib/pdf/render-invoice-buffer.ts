import { format } from "date-fns";
import type { Invoice, InvoiceLine, Party, Product } from "@prisma/client";
import { getCompanyConfig } from "@/lib/company";
import { decimalToNumber } from "@/lib/quotes";
import { renderInvoicePdf } from "@/lib/pdf/invoice-document";
import { getStateName } from "@/lib/accounting/states";

type InvoiceForPdf = Invoice & {
  party: Party;
  lines: Array<
    InvoiceLine & {
      product?: Pick<Product, "code"> | null;
    }
  >;
};

type AddressLike = {
  line1?: string | null;
  line2?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  postalCode?: string | null;
};

function formatAddress(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object") return String(value);

  const a = value as AddressLike;
  return [a.line1 || a.addressLine1, a.line2 || a.addressLine2, a.city, a.state, a.postalCode]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function resolveBuyer(invoice: InvoiceForPdf) {
  const immutable = invoice.immutableSnapshot as Record<string, unknown> | null;
  const billing = invoice.billingSnapshot as Record<string, unknown> | null;
  const buyer =
    (immutable?.buyer as Record<string, unknown> | undefined) ||
    billing ||
    {};

  const address = formatAddress(buyer.address);
  const state =
    (typeof buyer.state === "string" && buyer.state) ||
    (buyer.address &&
    typeof buyer.address === "object" &&
    typeof (buyer.address as AddressLike).state === "string"
      ? ((buyer.address as AddressLike).state as string)
      : "") ||
    invoice.party.placeOfSupplyCode ||
    "";

  return {
    name:
      (typeof buyer.tradeName === "string" && buyer.tradeName) ||
      (typeof buyer.name === "string" && buyer.name) ||
      invoice.party.tradeName ||
      "",
    company:
      (typeof buyer.legalName === "string" && buyer.legalName) ||
      (typeof buyer.company === "string" && buyer.company) ||
      invoice.party.legalName,
    email:
      (typeof buyer.email === "string" && buyer.email) || invoice.party.email || "",
    phone:
      (typeof buyer.phone === "string" && buyer.phone) || invoice.party.phone || "",
    address,
    state,
    gstin:
      (typeof buyer.gstin === "string" && buyer.gstin) ||
      invoice.party.gstin ||
      undefined,
    placeOfSupplyCode:
      (typeof buyer.placeOfSupplyCode === "string" && buyer.placeOfSupplyCode) ||
      invoice.placeOfSupplyCode,
  };
}

export async function buildInvoicePdfBuffer(invoice: InvoiceForPdf): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const company = getCompanyConfig();
  const buyer = resolveBuyer(invoice);

  const cgstAmount = invoice.lines.reduce((s, l) => s + decimalToNumber(l.cgstAmount), 0);
  const sgstAmount = invoice.lines.reduce((s, l) => s + decimalToNumber(l.sgstAmount), 0);
  const igstAmount = invoice.lines.reduce((s, l) => s + decimalToNumber(l.igstAmount), 0);

  const placeLabel =
    getStateName(buyer.placeOfSupplyCode) ||
    buyer.state ||
    buyer.placeOfSupplyCode ||
    "—";

  const buffer = await renderInvoicePdf({
    invoiceNumber: invoice.number,
    issueDate: format(invoice.issueDate, "dd MMM yyyy"),
    status: invoice.status,
    placeOfSupply: placeLabel,
    placeOfSupplyCode: buyer.placeOfSupplyCode,
    buyerGstin: buyer.gstin,
    subtotal: decimalToNumber(invoice.subtotal),
    taxAmount: decimalToNumber(invoice.taxAmount),
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOff: decimalToNumber(invoice.roundOff),
    total: decimalToNumber(invoice.total),
    company: {
      name: company.name,
      address: company.address,
      gstin: company.gstin,
      email: company.email,
      phone: company.phone,
      state: company.sellerState,
    },
    buyer: {
      name: buyer.name,
      company: buyer.company,
      email: buyer.email,
      phone: buyer.phone,
      address: buyer.address,
      state: buyer.state,
    },
    lineItems: invoice.lines.map((line) => ({
      description: line.description,
      hsnCode: line.hsnCode ?? undefined,
      qty: decimalToNumber(line.quantity),
      unit: line.uqc,
      unitPrice: decimalToNumber(line.unitPrice),
      taxableValue: decimalToNumber(line.taxableValue),
      taxRate: decimalToNumber(line.taxRate),
      cgstAmount: decimalToNumber(line.cgstAmount),
      sgstAmount: decimalToNumber(line.sgstAmount),
      igstAmount: decimalToNumber(line.igstAmount),
      lineTotal: decimalToNumber(line.lineTotal),
      productCode: line.product?.code,
    })),
  });

  return { buffer, filename: `${invoice.number}.pdf` };
}
