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
import { amountInWords } from "@/lib/accounting/money";

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
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.midGreen,
    textAlign: "right",
  },
  meta: {
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
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(142, 182, 155, 0.4)",
  },
  tableRowAlt: {
    backgroundColor: "rgba(142, 182, 155, 0.12)",
  },
  colDesc: { width: "24%" },
  colHsn: { width: "10%", textAlign: "center" },
  colQty: { width: "8%", textAlign: "right" },
  colUnit: { width: "8%", textAlign: "center" },
  colPrice: { width: "12%", textAlign: "right" },
  colTaxable: { width: "12%", textAlign: "right" },
  colTax: { width: "8%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },
  headerCell: {
    color: colors.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  totalsBox: {
    marginTop: 16,
    marginLeft: "auto",
    width: 260,
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
  amountWords: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "rgba(142, 182, 155, 0.15)",
    fontSize: 9,
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

export type InvoicePdfData = {
  invoiceNumber: string;
  issueDate: string;
  status: string;
  placeOfSupply: string;
  placeOfSupplyCode: string;
  buyerGstin?: string;
  subtotal: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  company: {
    name: string;
    address: string;
    gstin: string;
    email: string;
    phone: string;
    state: string;
  };
  buyer: {
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    state: string;
  };
  lineItems: Array<{
    description: string;
    hsnCode?: string;
    qty: number;
    unit: string;
    unitPrice: number;
    taxableValue: number;
    taxRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    lineTotal: number;
    productCode?: string;
  }>;
};

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.address ? <Text style={styles.muted}>{data.company.address}</Text> : null}
            {data.company.gstin ? <Text style={styles.muted}>GSTIN: {data.company.gstin}</Text> : null}
            {data.company.state ? <Text style={styles.muted}>State: {data.company.state}</Text> : null}
            {data.company.email ? <Text style={styles.muted}>{data.company.email}</Text> : null}
            {data.company.phone ? <Text style={styles.muted}>{data.company.phone}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>TAX INVOICE</Text>
            <Text style={styles.meta}>{data.invoiceNumber}</Text>
            <Text style={styles.meta}>Date: {data.issueDate}</Text>
            <Text style={styles.meta}>Place of Supply: {data.placeOfSupply} ({data.placeOfSupplyCode})</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text>{data.buyer.company || data.buyer.name || "—"}</Text>
          {data.buyer.name && data.buyer.company ? <Text>{data.buyer.name}</Text> : null}
          {data.buyerGstin ? <Text style={styles.muted}>GSTIN: {data.buyerGstin}</Text> : null}
          {data.buyer.address ? <Text style={styles.muted}>{data.buyer.address}</Text> : null}
          {data.buyer.state ? <Text style={styles.muted}>State: {data.buyer.state}</Text> : null}
          {data.buyer.email ? <Text style={styles.muted}>{data.buyer.email}</Text> : null}
          {data.buyer.phone ? <Text style={styles.muted}>{data.buyer.phone}</Text> : null}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.colDesc]}>Description</Text>
          <Text style={[styles.headerCell, styles.colHsn]}>HSN</Text>
          <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.headerCell, styles.colUnit]}>UQC</Text>
          <Text style={[styles.headerCell, styles.colPrice]}>Rate</Text>
          <Text style={[styles.headerCell, styles.colTaxable]}>Taxable</Text>
          <Text style={[styles.headerCell, styles.colTax]}>Tax%</Text>
          <Text style={[styles.headerCell, styles.colTotal]}>Total</Text>
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
            <Text style={styles.colHsn}>{line.hsnCode || "—"}</Text>
            <Text style={styles.colQty}>{line.qty}</Text>
            <Text style={styles.colUnit}>{line.unit}</Text>
            <Text style={styles.colPrice}>{formatMoney(line.unitPrice)}</Text>
            <Text style={styles.colTaxable}>{formatMoney(line.taxableValue)}</Text>
            <Text style={styles.colTax}>{line.taxRate}</Text>
            <Text style={styles.colTotal}>{formatMoney(line.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Taxable Value</Text>
            <Text>{formatMoney(data.subtotal)}</Text>
          </View>
          {data.cgstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>CGST</Text>
              <Text>{formatMoney(data.cgstAmount)}</Text>
            </View>
          ) : null}
          {data.sgstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>SGST</Text>
              <Text>{formatMoney(data.sgstAmount)}</Text>
            </View>
          ) : null}
          {data.igstAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text>IGST</Text>
              <Text>{formatMoney(data.igstAmount)}</Text>
            </View>
          ) : null}
          {data.taxAmount > 0 && !data.cgstAmount && !data.igstAmount ? (
            <View style={styles.totalRow}>
              <Text>Tax</Text>
              <Text>{formatMoney(data.taxAmount)}</Text>
            </View>
          ) : null}
          {data.roundOff !== 0 ? (
            <View style={styles.totalRow}>
              <Text>Round Off</Text>
              <Text>{formatMoney(data.roundOff)}</Text>
            </View>
          ) : null}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Invoice Total</Text>
            <Text style={styles.grandValue}>{formatMoney(data.total)}</Text>
          </View>
        </View>

        <View style={styles.amountWords}>
          <Text style={styles.sectionTitle}>Amount in Words</Text>
          <Text>{amountInWords(data.total, "Rupees")}</Text>
        </View>

        <Text style={styles.footer}>
          This is a computer-generated tax invoice · Generated by QuoteFlow
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

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = <InvoiceDocument data={data} />;
  const result = await pdf(doc).toBuffer();
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  return streamToBuffer(result as NodeJS.ReadableStream);
}
