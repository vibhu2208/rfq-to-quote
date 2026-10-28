import React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { amountInWords, round2 } from "@/lib/accounting/money";
import {
  QUOTE_CLOSING,
  QUOTE_GRAY,
  QUOTE_LINE,
  QUOTE_MUTED_BG,
  QUOTE_NAVY,
  formatQuoteAmount,
  formatQuoteQty,
} from "@/lib/quote-format";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    paddingTop: 28,
    paddingBottom: 72,
    paddingHorizontal: 32,
    backgroundColor: "#FFFFFF",
    color: "#222222",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    letterSpacing: 1.2,
  },
  tagline: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    marginTop: 2,
    letterSpacing: 0.6,
  },
  quoteTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    textAlign: "right",
    letterSpacing: 2,
  },
  gstinLine: {
    fontSize: 8,
    color: QUOTE_GRAY,
    textAlign: "right",
    marginTop: 2,
  },
  services: {
    fontSize: 7,
    color: QUOTE_GRAY,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 1.35,
  },
  metaBox: {
    flexDirection: "row",
    backgroundColor: QUOTE_MUTED_BG,
    padding: 10,
    marginBottom: 12,
  },
  toCol: {
    width: "62%",
    paddingRight: 10,
  },
  detailsCol: {
    width: "38%",
    paddingLeft: 8,
  },
  sectionKicker: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_GRAY,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  buyerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    marginBottom: 3,
  },
  bodyText: {
    fontSize: 8.5,
    color: "#333333",
    marginBottom: 1.5,
    lineHeight: 1.35,
  },
  detailsLabel: {
    fontSize: 8,
    color: QUOTE_GRAY,
    marginBottom: 2,
  },
  intro: {
    fontSize: 8,
    color: "#333333",
    marginTop: 8,
    lineHeight: 1.4,
  },
  table: {
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: QUOTE_NAVY,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: QUOTE_LINE,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: QUOTE_MUTED_BG,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: QUOTE_NAVY,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#FFFFFF",
  },
  td: {
    fontSize: 8.5,
    color: "#222222",
  },
  tdBold: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#222222",
  },
  colSn: { width: "6%", textAlign: "center" },
  colDesc: { width: "32%" },
  colHsn: { width: "11%", textAlign: "center" },
  colQty: { width: "10%", textAlign: "center" },
  colRate: { width: "11%", textAlign: "right" },
  colGst: { width: "7%", textAlign: "center" },
  colTax: { width: "11%", textAlign: "right" },
  colAmt: { width: "12%", textAlign: "right" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
  },
  wordsCol: {
    width: "54%",
    paddingRight: 12,
  },
  taxCol: {
    width: "44%",
  },
  kicker: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_GRAY,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  words: {
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  taxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.6,
    borderBottomColor: QUOTE_LINE,
    paddingVertical: 4,
  },
  taxLabel: {
    fontSize: 8.5,
    color: QUOTE_GRAY,
  },
  taxValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: QUOTE_NAVY,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  grandLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#FFFFFF",
  },
  grandValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },
  termsTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 3,
  },
  closing: {
    marginTop: 8,
    fontSize: 8,
    lineHeight: 1.45,
    color: "#333333",
  },
  signBlock: {
    marginTop: 14,
    alignItems: "flex-end",
  },
  signText: {
    fontSize: 8.5,
    marginBottom: 2,
    textAlign: "right",
    color: QUOTE_GRAY,
  },
  signName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_NAVY,
    textAlign: "right",
    marginTop: 14,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    borderTopWidth: 0.8,
    borderTopColor: QUOTE_NAVY,
    paddingTop: 6,
  },
  footerLine: {
    fontSize: 7,
    color: QUOTE_NAVY,
    textAlign: "center",
    marginBottom: 1.5,
  },
  footerMuted: {
    fontSize: 7,
    color: QUOTE_GRAY,
    textAlign: "center",
    marginBottom: 1.5,
  },
});

export type QuotePdfData = {
  quoteNumber: string;
  createdAt: string;
  status: string;
  withGst: boolean;
  buyerName: string;
  buyerCompany: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerState: string;
  buyerAddress: string;
  buyerGstin?: string;
  paymentTerms?: string;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  otherTaxAmount: number;
  otherTaxLabel: string;
  deliveryCharge: number;
  grandTotal: number;
  company: {
    name: string;
    tagline?: string;
    services?: string;
    address: string;
    gstin: string;
    email: string;
    phone: string;
    mobile?: string;
    website?: string;
    signatory?: string;
    bankName?: string;
    bankBranch?: string;
    bankIfsc?: string;
    bankAccount?: string;
    bankAccountType?: string;
  };
  lineItems: Array<{
    description: string;
    aliasName?: string;
    qty: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
    taxAmount: number;
    amount: number;
    hsnCode?: string;
    productCode?: string;
  }>;
};

function QuoteDocument({ data }: { data: QuotePdfData }) {
  const buyerTitle = data.buyerCompany || data.buyerName || "—";
  const contactPhone = data.company.mobile || data.company.phone;
  const signatory = data.company.signatory || data.company.name;
  const paymentTerms = data.paymentTerms || "Against Delivery";
  const totalTax = data.lineItems.reduce((sum, l) => sum + l.taxAmount, 0);
  const totalQty = data.lineItems.reduce((sum, l) => sum + l.qty, 0);
  const taxableAmount = Math.max(0, round2(data.subtotal - data.discountAmount));

  const gstBuckets = new Map<number, number>();
  for (const line of data.lineItems) {
    if (!data.withGst || line.taxRate <= 0) continue;
    gstBuckets.set(line.taxRate, round2((gstBuckets.get(line.taxRate) || 0) + line.taxAmount));
  }

  const signPhone = contactPhone ? contactPhone.replace(/^\+91\s*/, "") : "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{(data.company.name || "").toUpperCase()}</Text>
            {data.company.tagline ? <Text style={styles.tagline}>{data.company.tagline}</Text> : null}
          </View>
          <View>
            <Text style={styles.quoteTitle}>QUOTATION</Text>
            {data.company.gstin ? (
              <Text style={styles.gstinLine}>GSTIN: {data.company.gstin}</Text>
            ) : null}
          </View>
        </View>
        {data.company.services ? <Text style={styles.services}>{data.company.services}</Text> : null}

        <View style={styles.metaBox}>
          <View style={styles.toCol}>
            <Text style={styles.sectionKicker}>TO</Text>
            <Text style={styles.buyerName}>{buyerTitle}</Text>
            {data.buyerName && data.buyerCompany && data.buyerName !== data.buyerCompany ? (
              <Text style={styles.bodyText}>{data.buyerName}</Text>
            ) : null}
            {data.buyerAddress ? <Text style={styles.bodyText}>{data.buyerAddress}</Text> : null}
            {data.buyerState ? <Text style={styles.bodyText}>{data.buyerState}</Text> : null}
            <Text style={styles.bodyText}>M: {data.buyerPhone || "."}</Text>
            <Text style={styles.bodyText}>GSTIN: {data.buyerGstin || ""}</Text>
            {data.buyerEmail ? <Text style={styles.bodyText}>Email: {data.buyerEmail}</Text> : null}
          </View>
          <View style={styles.detailsCol}>
            <Text style={styles.sectionKicker}>DETAILS</Text>
            <Text style={styles.detailsLabel}>Ref No:  {data.quoteNumber}</Text>
            <Text style={styles.detailsLabel}>Date:  {data.createdAt}</Text>
            <Text style={styles.detailsLabel}>Subject: Quotation</Text>
            <Text style={styles.intro}>
              Dear Sir,{"\n"}
              At the outset we thank you for your interest in buying the products from {data.company.name}.
              We are pleased to quote our best prices as:
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colSn]}>SN</Text>
            <Text style={[styles.th, styles.colDesc]}>Description of Goods</Text>
            <Text style={[styles.th, styles.colHsn]}>HSN</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colRate]}>Unit Rate</Text>
            <Text style={[styles.th, styles.colGst]}>GST</Text>
            <Text style={[styles.th, styles.colTax]}>Tax</Text>
            <Text style={[styles.th, styles.colAmt]}>Amount</Text>
          </View>

          {data.lineItems.map((line, i) => {
            const displayName = line.aliasName?.trim() || line.description;
            const showCatalog =
              Boolean(line.aliasName?.trim()) &&
              Boolean(line.description.trim()) &&
              line.aliasName!.trim() !== line.description.trim();
            return (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.td, styles.colSn]}>{i + 1}</Text>
                <View style={styles.colDesc}>
                  <Text style={styles.tdBold}>{displayName || "—"}</Text>
                  {showCatalog ? (
                    <Text style={[styles.td, { fontSize: 7.5, color: QUOTE_GRAY, marginTop: 1 }]}>
                      {line.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.td, styles.colHsn]}>{line.hsnCode || ""}</Text>
                <Text style={[styles.td, styles.colQty]}>{formatQuoteQty(line.qty, line.unit)}</Text>
                <Text style={[styles.td, styles.colRate]}>{formatQuoteAmount(line.unitPrice)}</Text>
                <Text style={[styles.td, styles.colGst]}>
                  {data.withGst ? `${line.taxRate}%` : "—"}
                </Text>
                <Text style={[styles.td, styles.colTax]}>
                  {data.withGst ? formatQuoteAmount(line.taxAmount) : "—"}
                </Text>
                <Text style={[styles.tdBold, styles.colAmt]}>{formatQuoteAmount(line.amount)}</Text>
              </View>
            );
          })}

          <View style={styles.totalRow}>
            <Text style={[styles.td, styles.colSn]} />
            <Text style={[styles.td, styles.colDesc]} />
            <Text style={[styles.td, styles.colHsn]} />
            <Text style={[styles.tdBold, styles.colQty]}>
              {Number.isInteger(totalQty) ? String(totalQty) : totalQty}
            </Text>
            <Text style={[styles.td, styles.colRate]} />
            <Text style={[styles.tdBold, styles.colGst]}>Total</Text>
            <Text style={[styles.tdBold, styles.colTax]}>
              {data.withGst ? formatQuoteAmount(totalTax || data.gstAmount) : "—"}
            </Text>
            <Text style={[styles.tdBold, styles.colAmt]}>{formatQuoteAmount(data.grandTotal)}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.wordsCol}>
            <Text style={styles.kicker}>AMOUNT IN WORDS</Text>
            <Text style={styles.words}>{amountInWords(data.grandTotal, "").trim()}</Text>
          </View>
          <View style={styles.taxCol}>
            <Text style={styles.kicker}>TAX ANALYSIS</Text>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Taxable Amount</Text>
              <Text style={styles.taxValue}>{formatQuoteAmount(taxableAmount)}</Text>
            </View>
            {data.withGst
              ? Array.from(gstBuckets.entries()).map(([rate, tax]) => (
                  <View key={rate} style={styles.taxRow}>
                    <Text style={styles.taxLabel}>GST@{rate}%</Text>
                    <Text style={styles.taxValue}>{formatQuoteAmount(tax)}</Text>
                  </View>
                ))
              : null}
            {data.withGst && gstBuckets.size === 0 && data.gstAmount > 0 ? (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>GST</Text>
                <Text style={styles.taxValue}>{formatQuoteAmount(data.gstAmount)}</Text>
              </View>
            ) : null}
            {data.discountAmount > 0 ? (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Discount</Text>
                <Text style={styles.taxValue}>-{formatQuoteAmount(data.discountAmount)}</Text>
              </View>
            ) : null}
            {data.deliveryCharge > 0 ? (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Delivery</Text>
                <Text style={styles.taxValue}>{formatQuoteAmount(data.deliveryCharge)}</Text>
              </View>
            ) : null}
            {data.otherTaxAmount > 0 ? (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>{data.otherTaxLabel || "Other tax"}</Text>
                <Text style={styles.taxValue}>{formatQuoteAmount(data.otherTaxAmount)}</Text>
              </View>
            ) : null}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>{formatQuoteAmount(data.grandTotal)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.termsTitle}>TERMS & CONDITIONS</Text>
        <Text style={styles.bodyText}>Payment Terms: {paymentTerms}</Text>

        <Text style={styles.closing}>{QUOTE_CLOSING}</Text>

        <View style={styles.signBlock}>
          <Text style={styles.signText}>With thanks and best regards,</Text>
          <Text style={styles.signText}>Yours Sincerely</Text>
          <Text style={styles.signName}>
            {signatory}
            {signPhone ? ` (${signPhone})` : ""}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          {data.company.bankName || data.company.bankAccount ? (
            <Text style={styles.footerLine}>
              {`Bank Details: ${[
                data.company.bankName,
                data.company.bankBranch ? `Branch: ${data.company.bankBranch}` : null,
                data.company.bankIfsc ? `IFSC Code: ${data.company.bankIfsc}` : null,
                data.company.bankAccount ? `A/C No: ${data.company.bankAccount}` : null,
                data.company.bankAccountType ? `A/C Type: ${data.company.bankAccountType}` : null,
              ]
                .filter(Boolean)
                .join("   |   ")}`}
            </Text>
          ) : null}
          <Text style={styles.footerMuted}>
            {[
              data.company.address ? `Address: ${data.company.address}` : null,
              data.company.phone ? `PH: ${data.company.phone}` : null,
              data.company.mobile ? `Mobile: ${data.company.mobile}` : null,
            ]
              .filter(Boolean)
              .join("   |   ")}
          </Text>
          <Text
            style={styles.footerMuted}
            render={({ pageNumber, totalPages }) =>
              [
                data.company.email ? `Email: ${data.company.email}` : null,
                data.company.website ? `Website: ${data.company.website}` : null,
                `Page: ${pageNumber} of ${totalPages}`,
              ]
                .filter(Boolean)
                .join("   |   ")
            }
          />
        </View>
      </Page>
    </Document>
  );
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const doc = <QuoteDocument data={data} />;
  const result = await pdf(doc).toBuffer();
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  return streamToBuffer(result as NodeJS.ReadableStream);
}
