import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, Text, View, StyleSheet, Image, pdf } from "@react-pdf/renderer";
import { amountInWords, round2 } from "@/lib/accounting/money";
import {
  QUOTE_CLOSING,
  QUOTE_TEMPLATE_BLUE,
  QUOTE_TEMPLATE_BORDER,
  QUOTE_TEMPLATE_HEADER,
  formatQuoteAmount,
  formatQuoteQty,
  formatTaxAnalysis,
  quoteIntro,
} from "@/lib/quote-format";

function loadJpeg(filename: string) {
  return {
    data: readFileSync(path.join(process.cwd(), "public", filename)),
    format: "jpg" as const,
  };
}

function letterheadSrc() {
  return loadJpeg("quote-letterhead.jpeg");
}

function stampSrc() {
  return loadJpeg("quote-stamp.jpeg");
}

const BORDER = QUOTE_TEMPLATE_BORDER;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    color: "#000000",
  },
  letterhead: {
    width: "100%",
    height: 58,
    objectFit: "contain",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  toCol: {
    width: "58%",
    paddingRight: 12,
  },
  detailsCol: {
    width: "40%",
  },
  toLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
  buyerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: QUOTE_TEMPLATE_BLUE,
    marginBottom: 2,
  },
  buyerText: {
    fontSize: 9,
    color: QUOTE_TEMPLATE_BLUE,
    lineHeight: 1.3,
    marginBottom: 1,
  },
  quoteTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  detailsText: {
    fontSize: 9,
    marginBottom: 2,
  },
  dear: {
    fontSize: 9,
    marginTop: 4,
    marginBottom: 2,
  },
  intro: {
    fontSize: 9,
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 1.35,
  },
  table: {
    width: "100%",
    borderWidth: 0.6,
    borderColor: BORDER,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: QUOTE_TEMPLATE_HEADER,
    borderBottomWidth: 0.6,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: BORDER,
    minHeight: 22,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
  },
  td: {
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
  },
  tdBold: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
  },
  lastCell: {
    borderRightWidth: 0,
  },
  colSn: { width: "5%" },
  colDesc: { width: "32%" },
  colHsn: { width: "10%" },
  colQty: { width: "10%" },
  colRate: { width: "11%" },
  colGst: { width: "7%" },
  colTax: { width: "10%" },
  colAmt: { width: "15%" },
  colDescWide: { width: "49%" },
  colAmtWide: { width: "15%" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  catalog: {
    fontSize: 7,
    color: "#555555",
    marginTop: 1,
  },
  wordsRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: BORDER,
  },
  wordsCell: {
    width: "68%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
  },
  grandLabel: {
    width: "17%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    textAlign: "center",
  },
  grandValue: {
    width: "15%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 5,
    paddingHorizontal: 3,
    textAlign: "right",
  },
  taxAnalysis: {
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  termsTitle: {
    fontSize: 9,
    marginTop: 10,
    marginBottom: 2,
  },
  termsLine: {
    fontSize: 8,
    marginBottom: 2,
  },
  closing: {
    fontSize: 8,
    lineHeight: 1.4,
    marginBottom: 10,
  },
  regards: {
    fontSize: 9,
    marginBottom: 4,
  },
  signRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  stamp: {
    width: 62,
    height: 55,
    objectFit: "contain",
    marginRight: 10,
  },
  signText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  signName: {
    fontSize: 9,
  },
  footer: {
    marginTop: 36,
  },
  footerLine: {
    fontSize: 8,
    marginBottom: 2,
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
  introText?: string;
  termsText?: string;
  closingText?: string;
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
  const intro = data.introText?.trim() || quoteIntro(data.company.name);
  const terms = data.termsText?.trim() || `Payment Terms: ${paymentTerms}`;
  const closing = data.closingText?.trim() || QUOTE_CLOSING;
  const totalTax = data.lineItems.reduce((sum, l) => sum + l.taxAmount, 0);
  const totalQty = data.lineItems.reduce((sum, l) => sum + l.qty, 0);
  const taxableAmount = Math.max(0, round2(data.subtotal - data.discountAmount));
  const withGst = data.withGst;

  const gstBuckets = new Map<number, number>();
  for (const line of data.lineItems) {
    if (!withGst || line.taxRate <= 0) continue;
    gstBuckets.set(line.taxRate, round2((gstBuckets.get(line.taxRate) || 0) + line.taxAmount));
  }

  const signPhone = contactPhone ? contactPhone.replace(/^\+91\s*/, "") : "";
  const words = amountInWords(data.grandTotal, "").replace(/\s+/g, " ").trim();
  const taxAnalysis = formatTaxAnalysis({
    taxable: taxableAmount,
    withGst,
    gstBuckets: Array.from(gstBuckets.entries()),
    gstAmount: data.gstAmount,
    discountAmount: data.discountAmount,
    deliveryCharge: data.deliveryCharge,
    otherTaxAmount: data.otherTaxAmount,
    otherTaxLabel: data.otherTaxLabel,
  });

  const descCol = withGst ? styles.colDesc : styles.colDescWide;
  const amtCol = withGst ? styles.colAmt : styles.colAmtWide;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Image src={letterheadSrc()} style={styles.letterhead} />

        <View style={styles.metaRow}>
          <View style={styles.toCol}>
            <Text style={styles.toLabel}>To,</Text>
            <Text style={styles.buyerName}>{buyerTitle}</Text>
            {data.buyerName && data.buyerCompany && data.buyerName !== data.buyerCompany ? (
              <Text style={styles.buyerText}>{data.buyerName}</Text>
            ) : null}
            {data.buyerAddress ? <Text style={styles.buyerText}>{data.buyerAddress}</Text> : null}
            <Text style={styles.buyerText}>
              {[data.buyerState, data.buyerPhone ? `M: ${data.buyerPhone}` : "M: ."]
                .filter(Boolean)
                .join("  ")}{" "}
              GSTIN: {data.buyerGstin || ""}
            </Text>
            {data.buyerEmail ? <Text style={styles.buyerText}>Email: {data.buyerEmail}</Text> : null}
          </View>
          <View style={styles.detailsCol}>
            <Text style={styles.quoteTitle}>Quotation</Text>
            {data.company.gstin ? (
              <Text style={styles.detailsText}>GSTIN: {data.company.gstin}</Text>
            ) : null}
            <Text style={styles.detailsText}>Ref No: {data.quoteNumber}</Text>
            <Text style={styles.detailsText}>Subject: Quotation</Text>
            <Text style={styles.detailsText}>Date:</Text>
            <Text style={styles.detailsText}>{data.createdAt}</Text>
          </View>
        </View>

        <Text style={styles.dear}>Dear Sir,</Text>
        <Text style={styles.intro}>{intro}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colSn, styles.center]}>SN</Text>
            <Text style={[styles.th, descCol]}>Description of Goods</Text>
            <Text style={[styles.th, styles.colHsn, styles.center]}>HSN</Text>
            <Text style={[styles.th, styles.colQty, styles.center]}>Qty</Text>
            <Text style={[styles.th, styles.colRate, styles.right]}>Unit Rate</Text>
            {withGst ? (
              <>
                <Text style={[styles.th, styles.colGst, styles.center]}>GST</Text>
                <Text style={[styles.th, styles.colTax, styles.right]}>Tax</Text>
              </>
            ) : null}
            <Text style={[styles.th, amtCol, styles.right, styles.lastCell]}>Amount</Text>
          </View>

          {data.lineItems.map((line, i) => {
            const displayName = line.aliasName?.trim() || line.description;
            const showCatalog =
              Boolean(line.aliasName?.trim()) &&
              Boolean(line.description.trim()) &&
              line.aliasName!.trim() !== line.description.trim();
            return (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.td, styles.colSn, styles.center]}>{i + 1}</Text>
                <View style={[styles.td, descCol]}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8 }}>
                    {displayName || "—"}
                  </Text>
                  {showCatalog ? <Text style={styles.catalog}>{line.description}</Text> : null}
                </View>
                <Text style={[styles.td, styles.colHsn, styles.center]}>{line.hsnCode || ""}</Text>
                <Text style={[styles.td, styles.colQty, styles.center]}>
                  {formatQuoteQty(line.qty, line.unit)}
                </Text>
                <Text style={[styles.td, styles.colRate, styles.right]}>
                  {formatQuoteAmount(line.unitPrice)}
                </Text>
                {withGst ? (
                  <>
                    <Text style={[styles.td, styles.colGst, styles.center]}>{line.taxRate}%</Text>
                    <Text style={[styles.td, styles.colTax, styles.right]}>
                      {formatQuoteAmount(line.taxAmount)}
                    </Text>
                  </>
                ) : null}
                <Text style={[styles.tdBold, amtCol, styles.right, styles.lastCell]}>
                  {formatQuoteAmount(line.amount)}
                </Text>
              </View>
            );
          })}

          <View style={styles.tableRow}>
            <Text style={[styles.td, styles.colSn]} />
            <Text style={[styles.td, descCol]} />
            <Text style={[styles.td, styles.colHsn]} />
            <Text style={[styles.tdBold, styles.colQty, styles.center]}>
              {Number.isInteger(totalQty) ? String(totalQty) : String(totalQty)}
            </Text>
            {withGst ? (
              <>
                <Text style={[styles.td, styles.colRate]} />
                <Text style={[styles.tdBold, styles.colGst, styles.center]}>Total</Text>
                <Text style={[styles.tdBold, styles.colTax, styles.right]}>
                  {formatQuoteAmount(totalTax || data.gstAmount)}
                </Text>
              </>
            ) : (
              <Text style={[styles.tdBold, styles.colRate, styles.right]}>Total</Text>
            )}
            <Text style={[styles.tdBold, amtCol, styles.right, styles.lastCell]}>
              {formatQuoteAmount(data.grandTotal)}
            </Text>
          </View>

          <View style={styles.wordsRow}>
            <Text style={styles.wordsCell}>Amount in Words: {words}</Text>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{formatQuoteAmount(data.grandTotal)}</Text>
          </View>
          <View>
            <Text style={styles.taxAnalysis}>{taxAnalysis}</Text>
          </View>
        </View>

        <Text style={styles.termsTitle}>Terms & Conditions:</Text>
        {terms.split("\n").map((line, i) => (
          <Text key={`term-${i}`} style={styles.termsLine}>
            {line || " "}
          </Text>
        ))}
        <Text style={styles.closing}>{closing}</Text>

        <Text style={styles.regards}>With thanks and best regards,</Text>
        <View style={styles.signRow}>
          <Image src={stampSrc()} style={styles.stamp} />
          <View>
            <Text style={styles.signText}>Yours Sincerely</Text>
            <Text style={styles.signName}>
              {signatory}
              {signPhone ? `(${signPhone})` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.footer} wrap={false}>
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
                .join("  ")}`}
            </Text>
          ) : null}
          <Text
            style={styles.footerLine}
            render={({ pageNumber, totalPages }) =>
              [
                data.company.address ? `Address: ${data.company.address}` : null,
                data.company.phone ? `PH: ${data.company.phone}` : null,
                data.company.mobile ? `Mobile: ${data.company.mobile}` : null,
                data.company.email ? `Email: ${data.company.email}` : null,
                data.company.website ? `Website: ${data.company.website}` : null,
                `Page: ${pageNumber} of ${totalPages}`,
              ]
                .filter(Boolean)
                .join(" | ")
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
