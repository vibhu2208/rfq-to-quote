import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/tax";

const colors = {
  darkPrimary: "#0B2B26",
  darkSecondary: "#163832",
  midGreen: "#235347",
  lightGreen: "#8EB69B",
  background: "#F5F1E8",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    backgroundColor: colors.background,
    color: colors.darkPrimary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.midGreen,
  },
  companyName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: colors.darkPrimary,
    marginBottom: 4,
  },
  muted: {
    color: colors.midGreen,
    fontSize: 9,
    marginBottom: 2,
  },
  quoteTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.midGreen,
    textAlign: "right",
  },
  quoteMeta: {
    textAlign: "right",
    marginTop: 6,
    fontSize: 9,
    color: colors.darkSecondary,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.midGreen,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.darkSecondary,
    color: colors.white,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(142, 182, 155, 0.4)",
  },
  tableRowAlt: {
    backgroundColor: "rgba(142, 182, 155, 0.12)",
  },
  colDesc: { width: "38%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "center" },
  colPrice: { width: "16%", textAlign: "right" },
  colTax: { width: "10%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  headerCell: {
    color: colors.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  totalsBox: {
    marginTop: 16,
    marginLeft: "auto",
    width: 220,
    padding: 12,
    backgroundColor: colors.white,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.midGreen,
  },
  grandLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: colors.darkPrimary,
  },
  grandValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: colors.darkPrimary,
  },
  notes: {
    marginTop: 24,
    padding: 10,
    backgroundColor: "rgba(142, 182, 155, 0.15)",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: colors.midGreen,
    textAlign: "center",
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
  notes: string;
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
  };
  lineItems: Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
    productCode?: string;
  }>;
};

function QuoteDocument({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.address ? <Text style={styles.muted}>{data.company.address}</Text> : null}
            {data.company.gstin ? <Text style={styles.muted}>GSTIN: {data.company.gstin}</Text> : null}
            {data.company.email ? <Text style={styles.muted}>{data.company.email}</Text> : null}
            {data.company.phone ? <Text style={styles.muted}>{data.company.phone}</Text> : null}
          </View>
          <View>
            <Text style={styles.quoteTitle}>QUOTATION</Text>
            <Text style={styles.quoteMeta}>{data.quoteNumber}</Text>
            <Text style={styles.quoteMeta}>Date: {data.createdAt}</Text>
            <Text style={styles.quoteMeta}>
              GST: {data.withGst ? "Included" : "Excluded"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text>{data.buyerCompany || data.buyerName || "—"}</Text>
          {data.buyerName && data.buyerCompany ? <Text>{data.buyerName}</Text> : null}
          {data.buyerAddress ? <Text style={styles.muted}>{data.buyerAddress}</Text> : null}
          {data.buyerState ? <Text style={styles.muted}>State: {data.buyerState}</Text> : null}
          {data.buyerEmail ? <Text style={styles.muted}>{data.buyerEmail}</Text> : null}
          {data.buyerPhone ? <Text style={styles.muted}>{data.buyerPhone}</Text> : null}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.colDesc]}>Description</Text>
          <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.headerCell, styles.colUnit]}>Unit</Text>
          <Text style={[styles.headerCell, styles.colPrice]}>Rate</Text>
          <Text style={[styles.headerCell, styles.colTax]}>Tax%</Text>
          <Text style={[styles.headerCell, styles.colTotal]}>Amount</Text>
        </View>

        {data.lineItems.map((line, i) => (
          <View
            key={i}
            style={i % 2 === 1 ? { ...styles.tableRow, ...styles.tableRowAlt } : styles.tableRow}
          >
            <View style={styles.colDesc}>
              <Text>{line.description}</Text>
              {line.productCode ? <Text style={styles.muted}>{line.productCode}</Text> : null}
            </View>
            <Text style={styles.colQty}>{line.qty}</Text>
            <Text style={styles.colUnit}>{line.unit}</Text>
            <Text style={styles.colPrice}>{formatMoney(line.unitPrice)}</Text>
            <Text style={styles.colTax}>{line.taxRate}</Text>
            <Text style={styles.colTotal}>{formatMoney(line.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatMoney(data.subtotal)}</Text>
          </View>
          {data.discountAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>Discount</Text>
              <Text>-{formatMoney(data.discountAmount)}</Text>
            </View>
          ) : null}
          {data.withGst && data.cgstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>CGST</Text>
              <Text>{formatMoney(data.cgstAmount)}</Text>
            </View>
          ) : null}
          {data.withGst && data.sgstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>SGST</Text>
              <Text>{formatMoney(data.sgstAmount)}</Text>
            </View>
          ) : null}
          {data.withGst && data.igstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>IGST</Text>
              <Text>{formatMoney(data.igstAmount)}</Text>
            </View>
          ) : null}
          {data.withGst && data.gstAmount > 0 && !data.cgstAmount && !data.igstAmount ? (
            <View style={styles.totalRow}>
              <Text>GST</Text>
              <Text>{formatMoney(data.gstAmount)}</Text>
            </View>
          ) : null}
          {data.otherTaxAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>{data.otherTaxLabel || "Other tax"}</Text>
              <Text>{formatMoney(data.otherTaxAmount)}</Text>
            </View>
          ) : null}
          {data.deliveryCharge > 0 ? (
            <View style={styles.totalRow}>
              <Text>Delivery</Text>
              <Text>{formatMoney(data.deliveryCharge)}</Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{formatMoney(data.grandTotal)}</Text>
          </View>
        </View>

        {data.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Thank you for your business · Generated by QuoteFlow
        </Text>
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
