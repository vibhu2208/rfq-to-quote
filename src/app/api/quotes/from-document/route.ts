import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { getCompanyConfig } from "@/lib/company";
import { calculateQuoteTotals } from "@/lib/tax";
import { nextQuoteNumber, decimalToNumber } from "@/lib/quotes";
import {
  assertAllowedDocument,
  extractQuoteFieldsFromDocument,
  REDUCTO_MAX_BYTES,
} from "@/lib/reducto";

function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function filenameFromFile(file: File): string {
  const name = (file.name || "").trim();
  if (name && name.includes(".")) return name;
  const type = file.type || "";
  const byType: Record<string, string> = {
    "image/png": "pasted-screenshot.png",
    "image/jpeg": "pasted-screenshot.jpg",
    "image/jpg": "pasted-screenshot.jpg",
    "image/webp": "pasted-screenshot.webp",
    "image/gif": "pasted-screenshot.gif",
    "image/heic": "pasted-screenshot.heic",
    "image/heif": "pasted-screenshot.heic",
    "image/tiff": "pasted-screenshot.tiff",
    "image/bmp": "pasted-screenshot.bmp",
    "application/pdf": "document.pdf",
  };
  return byType[type] || name || "pasted-screenshot.png";
}

/**
 * Upload a document/photo → Reducto extract (product, model, company, qty, price)
 * → create a draft quote immediately (skips RFQ inbox flow).
 */
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
    if (file.size > REDUCTO_MAX_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${REDUCTO_MAX_BYTES / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    try {
      assertAllowedDocument(filename, file.size);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid file";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const overrideCompany = formString(form, "company");
    const overrideContact = formString(form, "contactName");
    const overrideEmail = formString(form, "email");
    const overridePhone = formString(form, "phone");
    const partyId = formString(form, "partyId");
    const notes = formString(form, "notes");

    const party = partyId
      ? await prisma.party.findFirst({
          where: { id: partyId, active: true, type: { not: "OTHER" } },
          include: {
            addresses: {
              where: { type: "BILLING" },
              orderBy: { isDefault: "desc" },
              take: 1,
            },
          },
        })
      : overrideCompany
        ? await prisma.party.findFirst({
            where: {
              active: true,
              type: { not: "OTHER" },
              OR: [
                { legalName: { contains: overrideCompany, mode: "insensitive" } },
                { tradeName: { contains: overrideCompany, mode: "insensitive" } },
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fields } = await extractQuoteFieldsFromDocument(buffer, filename);

    const company = getCompanyConfig();
    const lines = fields.lineItems.map((l) => {
      const desc = [l.productName, l.model ? `Model: ${l.model}` : null]
        .filter(Boolean)
        .join(" — ");
      return {
        description: desc || "From document",
        qty: l.quantity > 0 ? l.quantity : 1,
        unit: l.unit || "pcs",
        unitPrice: l.unitPrice,
        taxRate: 18,
      };
    });

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
    const buyerCompany = overrideCompany || party?.legalName || fields.company || "";
    const buyerName =
      overrideContact || party?.managedByName || party?.tradeName || fields.contactName || "";
    const buyerEmail = overrideEmail || party?.email || "";
    const buyerPhone = overridePhone || party?.phone || "";
    const buyerAddress = billing
      ? [billing.addressLine1, billing.city, billing.state, billing.postalCode]
          .filter(Boolean)
          .join(", ")
      : "";

    const quote = await prisma.quote.create({
      data: {
        quoteNumber,
        status: "DRAFT",
        buyerName,
        buyerCompany,
        buyerEmail,
        buyerPhone,
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
        notes: notes,
        lineItems: {
          create: lines.map((l, i) => ({
            description: l.description,
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: calc.lineTotals[i] ?? l.qty * l.unitPrice,
            sortOrder: i,
          })),
        },
      },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json(
      {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        grandTotal: decimalToNumber(quote.grandTotal),
        extracted: {
          company: buyerCompany,
          contactName: buyerName,
          lineItems: fields.lineItems,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create quote from document";
    const status =
      message.includes("REDUCTO_API_KEY") || message.includes("not configured")
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
