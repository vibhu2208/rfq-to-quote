import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { getCompanyConfig } from "@/lib/company";
import { calculateQuoteTotals } from "@/lib/tax";
import { nextQuoteNumber, decimalToNumber } from "@/lib/quotes";
import { isQuoteSpreadsheet, parseQuoteSpreadsheet } from "@/lib/quote-csv";
import { quoteLinesFromSpreadsheetItems } from "@/lib/quote-from-spreadsheet";
import { REDUCTO_MAX_BYTES } from "@/lib/reducto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function filenameFromFile(file: File): string {
  const name = (file.name || "").trim();
  return name || "quote.csv";
}

function quoteNameFromFile(filename: string, company: string): string {
  if (company) return company;
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported quote";
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const filename = filenameFromFile(file);
    if (file.size <= 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > REDUCTO_MAX_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${REDUCTO_MAX_BYTES / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }
    if (!isQuoteSpreadsheet(filename, file.type)) {
      return NextResponse.json(
        { error: "Use a CSV or Excel file (.csv, .xlsx, .xls)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseQuoteSpreadsheet(buffer, filename);
    if (parsed.items.length === 0) {
      return NextResponse.json(
        { error: "No line items found in this spreadsheet" },
        { status: 400 }
      );
    }

    const codes = [
      ...new Set(parsed.items.map((item) => item.code.trim()).filter(Boolean)),
    ];
    const products = codes.length
      ? await prisma.product.findMany({
          where: {
            OR: codes.map((code) => ({ code: { equals: code, mode: "insensitive" as const } })),
          },
          select: { id: true, code: true, taxRate: true, hsnCode: true },
        })
      : [];

    const lines = quoteLinesFromSpreadsheetItems(
      parsed.items,
      products.map((p) => ({
        id: p.id,
        code: p.code,
        taxRate: decimalToNumber(p.taxRate),
        hsnCode: p.hsnCode,
      }))
    );

    const party = parsed.company
      ? await prisma.party.findFirst({
          where: {
            active: true,
            type: { not: "OTHER" },
            OR: [
              { legalName: { contains: parsed.company, mode: "insensitive" } },
              { tradeName: { contains: parsed.company, mode: "insensitive" } },
            ],
          },
          include: {
            addresses: {
              where: { type: "BILLING" },
              orderBy: { isDefault: "desc" },
              take: 1,
            },
          },
        })
      : null;
    const billing = party?.addresses[0];
    const company = getCompanyConfig();

    const calc = calculateQuoteTotals({
      lines: lines.map((l) => ({
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      })),
      withGst: true,
      buyerState: billing?.state || "",
      sellerState: company.sellerState,
      gstMode: "AUTO",
      deliveryCharge: 0,
      discountPercent: 0,
      discountAmount: 0,
      otherTaxAmount: 0,
      overrides: {},
    });

    const quoteNumber = await nextQuoteNumber();
    const buyerCompany = party?.legalName || parsed.company || "";
    const buyerAddress = billing
      ? [billing.addressLine1, billing.city, billing.state, billing.postalCode]
          .filter(Boolean)
          .join(", ")
      : "";

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        quoteName: quoteNameFromFile(filename, buyerCompany),
        status: "DRAFT",
        buyerName: party?.managedByName || party?.tradeName || "",
        buyerCompany,
        buyerEmail: party?.email || "",
        buyerPhone: party?.phone || "",
        buyerGstin: party?.gstin || "",
        buyerAddress,
        buyerState: billing?.state || "",
        withGst: true,
        gstMode: "AUTO",
        subtotal: calc.subtotal,
        gstAmount: calc.gstAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        otherTaxAmount: calc.otherTaxAmount,
        deliveryCharge: calc.deliveryCharge,
        discountAmount: calc.discountAmount,
        discountPercent: 0,
        grandTotal: calc.grandTotal,
        lineItems: {
          create: lines.map((l, i) => ({
            productId: l.productId,
            description: l.description,
            aliasName: l.aliasName || "",
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: calc.lineTotals[i] ?? l.qty * l.unitPrice,
            sortOrder: i,
          })),
        },
      },
      select: { id: true, quoteNumber: true, status: true, grandTotal: true },
    });

    return NextResponse.json(
      {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        grandTotal: decimalToNumber(quote.grandTotal),
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to import spreadsheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
