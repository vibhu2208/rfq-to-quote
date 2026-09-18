import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { amountInWords, round2 } from "@/lib/accounting/money";

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 42,
    backgroundColor: "#FFFFFF",
    color: "#111111",
  },
  letterhead: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#111111",
    paddingBottom: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  companyName: {
    fontSize: 18,
    fontFamily: "Times-Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  letterheadLine: {
    fontSize: 8.5,
    textAlign: "center",
    marginBottom: 1.5,
    color: "#222222",
  },
  title: {
    fontSize: 16,
    fontFamily: "Times-Bold",
    textAlign: "center",
    textDecoration: "underline",
    marginBottom: 14,
  },
  toRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  toBlock: {
    width: "72%",
  },
  dateBlock: {
    width: "28%",
    alignItems: "flex-end",
  },
  label: {
    fontFamily: "Times-Bold",
    marginBottom: 2,
  },
  bodyText: {
    marginBottom: 3,
    lineHeight: 1.35,
  },
  subject: {
    marginTop: 4,
    marginBottom: 8,
  },
  intro: {
    marginBottom: 10,
    lineHeight: 1.4,
  },
  refLine: {
    marginBottom: 10,
    fontFamily: "Times-Bold",
  },
  table: {
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#111111",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    backgroundColor: "#F0F0F0",
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: "#333333",
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 3,
    backgroundColor: "#FAFAFA",
  },
  th: {
    fontFamily: "Times-Bold",
    fontSize: 8,
  },
  td: {
    fontSize: 8.5,
  },
  colSn: { width: "5%" },
  colDesc: { width: "28%" },
  colHsn: { width: "11%", textAlign: "center" },
  colQty: { width: "7%", textAlign: "right" },
  colUnit: { width: "7%", textAlign: "center" },
  colRate: { width: "12%", textAlign: "right" },
  colGst: { width: "7%", textAlign: "right" },
  colTax: { width: "11%", textAlign: "right" },
  colAmt: { width: "12%", textAlign: "right" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    marginBottom: 8,
  },
  amountWords: {
    width: "62%",
    fontSize: 9,
    lineHeight: 1.35,
  },
  grandBox: {
    width: "36%",
    borderWidth: 1,
    borderColor: "#111111",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  grandLabel: {
    fontFamily: "Times-Bold",
    fontSize: 10,
  },
  grandValue: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    textAlign: "right",
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 10,
    marginTop: 8,
    marginBottom: 3,
    textDecoration: "underline",
  },
  taxAnalysis: {
    fontSize: 9,
    marginBottom: 2,
  },
  closing: {
    marginTop: 10,
    lineHeight: 1.4,
    fontSize: 9.5,
  },
  signBlock: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  signText: {
    fontSize: 9.5,
    marginBottom: 2,
    textAlign: "right",
  },
  bankBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#111111",
    padding: 8,
    fontSize: 8.5,
  },
  bankTitle: {
    fontFamily: "Times-Bold",
    marginBottom: 3,
    fontSize: 9,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 42,
    right: 42,
    borderTopWidth: 0.75,
    borderTopColor: "#111111",
    paddingTop: 6,
    fontSize: 7.5,
    textAlign: "center",
    color: "#222222",
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
  notes: string;
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
  const totalAmount = data.lineItems.reduce((sum, l) => sum + l.amount, 0);

  const gstBuckets = new Map<number, number>();
  for (const line of data.lineItems) {
    if (!data.withGst || line.taxRate <= 0) continue;
    gstBuckets.set(line.taxRate, round2((gstBuckets.get(line.taxRate) || 0) + line.taxAmount));
  }

  const phoneBits = [
    data.company.phone ? `PH : ${data.company.phone}` : null,
    data.company.mobile ? `Mobile : ${data.company.mobile}` : null,
    data.company.email ? `Email : ${data.company.email}` : null,
    data.company.website ? `Website : ${data.company.website}` : null,
  ].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <Text style={styles.companyName}>{data.company.name}</Text>
          {data.company.address ? (
            <Text style={styles.letterheadLine}>Address : {data.company.address}</Text>
          ) : null}
          {phoneBits.length ? (
            <Text style={styles.letterheadLine}>{phoneBits.join("   ")}</Text>
          ) : null}
          {data.company.gstin ? (
            <Text style={styles.letterheadLine}>GSTIN: {data.company.gstin}</Text>
          ) : null}
        </View>

        <Text style={styles.title}>Quotation</Text>

        <View style={styles.toRow}>
          <View style={styles.toBlock}>
            <Text style={styles.label}>To,</Text>
            <Text style={[styles.bodyText, { fontFamily: "Times-Bold" }]}>{buyerTitle}</Text>
            {data.buyerName && data.buyerCompany ? (
              <Text style={styles.bodyText}>{data.buyerName}</Text>
            ) : null}
            {data.buyerAddress ? <Text style={styles.bodyText}>{data.buyerAddress}</Text> : null}
            {data.buyerState && !data.buyerAddress?.toLowerCase().includes(data.buyerState.toLowerCase()) ? (
              <Text style={styles.bodyText}>{data.buyerState}</Text>
            ) : null}
            {data.buyerGstin ? <Text style={styles.bodyText}>GSTIN: {data.buyerGstin}</Text> : null}
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.bodyText}>Date:</Text>
            <Text style={styles.bodyText}>{data.createdAt}</Text>
          </View>
        </View>

        <Text style={styles.subject}>
          <Text style={{ fontFamily: "Times-Bold" }}>Subject: </Text>
          Quotation
        </Text>

        <Text style={styles.bodyText}>Dear Sir,</Text>
        <Text style={styles.intro}>
          At the outset we thank you for your interest in buying the products from {data.company.name}.
          We are pleased to quote our best prices as:
        </Text>

        <Text style={styles.refLine}>Ref No: {data.quoteNumber}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colSn]}>SN</Text>
            <Text style={[styles.th, styles.colDesc]}>Description of Goods</Text>
            <Text style={[styles.th, styles.colHsn]}>HSN</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colRate]}>Rate</Text>
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
                <Text style={styles.td}>{displayName || "—"}</Text>
                {showCatalog ? (
                  <Text style={[styles.td, { fontSize: 7.5, color: "#444444", marginTop: 1 }]}>
                    {line.description}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.td, styles.colHsn]}>{line.hsnCode || "—"}</Text>
              <Text style={[styles.td, styles.colQty]}>{line.qty}</Text>
              <Text style={[styles.td, styles.colUnit]}>{line.unit || "NOS"}</Text>
              <Text style={[styles.td, styles.colRate]}>{formatInr(line.unitPrice)}</Text>
              <Text style={[styles.td, styles.colGst]}>
                {data.withGst ? `${line.taxRate}%` : "—"}
              </Text>
              <Text style={[styles.td, styles.colTax]}>
                {data.withGst ? formatInr(line.taxAmount) : "—"}
              </Text>
              <Text style={[styles.td, styles.colAmt]}>{formatInr(line.amount)}</Text>
            </View>
            );
          })}

          <View style={styles.totalRow}>
            <Text style={[styles.td, styles.colSn]} />
            <Text style={[styles.td, styles.colDesc, { fontFamily: "Times-Bold" }]}>Total</Text>
            <Text style={[styles.td, styles.colHsn]} />
            <Text style={[styles.td, styles.colQty]} />
            <Text style={[styles.td, styles.colUnit]} />
            <Text style={[styles.td, styles.colRate]} />
            <Text style={[styles.td, styles.colGst]} />
            <Text style={[styles.td, styles.colTax, { fontFamily: "Times-Bold" }]}>
              {data.withGst ? formatInr(totalTax || data.gstAmount) : "—"}
            </Text>
            <Text style={[styles.td, styles.colAmt, { fontFamily: "Times-Bold" }]}>
              {formatInr(data.grandTotal || totalAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.amountWords}>
            <Text style={{ fontFamily: "Times-Bold" }}>Amount in Words: </Text>
            {amountInWords(data.grandTotal, "Rupees")}
          </Text>
          <View style={styles.grandBox}>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{formatInr(data.grandTotal)}</Text>
          </View>
        </View>

        {data.withGst ? (
          <View>
            <Text style={styles.sectionTitle}>Tax Analysis:</Text>
            <Text style={styles.taxAnalysis}>
              {`Taxable Amount: ${formatInr(Math.max(0, data.subtotal - data.discountAmount))}${
                gstBuckets.size > 0
                  ? Array.from(gstBuckets.entries())
                      .map(([rate, tax]) => `    GST@${rate}% ${formatInr(tax)}`)
                      .join("")
                  : data.gstAmount > 0
                    ? `    GST ${formatInr(data.gstAmount)}`
                    : ""
              }`}
            </Text>
            {data.cgstAmount > 0 || data.sgstAmount > 0 || data.igstAmount > 0 ? (
              <Text style={styles.taxAnalysis}>
                {[
                  data.cgstAmount > 0 ? `CGST: ${formatInr(data.cgstAmount)}` : null,
                  data.sgstAmount > 0 ? `SGST: ${formatInr(data.sgstAmount)}` : null,
                  data.igstAmount > 0 ? `IGST: ${formatInr(data.igstAmount)}` : null,
                ]
                  .filter(Boolean)
                  .join("   ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {data.discountAmount > 0 || data.deliveryCharge > 0 || data.otherTaxAmount > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Other Charges:</Text>
            {data.discountAmount > 0 ? (
              <Text style={styles.taxAnalysis}>Discount: -{formatInr(data.discountAmount)}</Text>
            ) : null}
            {data.deliveryCharge > 0 ? (
              <Text style={styles.taxAnalysis}>Delivery: {formatInr(data.deliveryCharge)}</Text>
            ) : null}
            {data.otherTaxAmount > 0 ? (
              <Text style={styles.taxAnalysis}>
                {data.otherTaxLabel || "Other tax"}: {formatInr(data.otherTaxAmount)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Terms & Conditions:</Text>
        <Text style={styles.bodyText}>Payment Terms: {paymentTerms}</Text>
        {data.notes ? <Text style={styles.bodyText}>{data.notes}</Text> : null}

        <Text style={styles.closing}>
          We look forward to your favorable response to our proposal. We trust that you will find our
          offer competitive and would be pleased to receive your valued order. Should you require any
          further information or clarification, please feel free to contact us. We are committed to
          delivering the best products and services to your organization and assure you of our highest
          level of service at all times.
        </Text>

        <View style={styles.signBlock}>
          <Text style={styles.signText}>With thanks and best regards,</Text>
          <Text style={styles.signText}>Yours Sincerely</Text>
          <Text style={[styles.signText, { fontFamily: "Times-Bold", marginTop: 18 }]}>
            {signatory}
            {contactPhone ? `(${contactPhone.replace(/^\+91\s*/, "")})` : ""}
          </Text>
          {data.company.gstin ? (
            <Text style={styles.signText}>GSTIN: {data.company.gstin}</Text>
          ) : null}
        </View>

        {data.company.bankName || data.company.bankAccount ? (
          <View style={styles.bankBox} wrap={false}>
            <Text style={styles.bankTitle}>Bank Details:</Text>
            <Text>
              {[
                data.company.bankName ? `${data.company.bankName}` : null,
                data.company.bankBranch ? `Branch : ${data.company.bankBranch}` : null,
                data.company.bankIfsc ? `IFSC Code : ${data.company.bankIfsc}` : null,
              ]
                .filter(Boolean)
                .join("   ")}
            </Text>
            <Text style={{ marginTop: 2 }}>
              {[
                data.company.bankAccount ? `A/C No : ${data.company.bankAccount}` : null,
                data.company.bankAccountType
                  ? `A/C Type : ${data.company.bankAccountType}`
                  : null,
              ]
                .filter(Boolean)
                .join("   ")}
            </Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            [
              data.company.address ? `Address : ${data.company.address}` : null,
              phoneBits.join("   ") || null,
              `Page: ${pageNumber} of ${totalPages}`,
            ]
              .filter(Boolean)
              .join("   ")
          }
          fixed
        />
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
