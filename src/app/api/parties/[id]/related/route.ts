import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import {
  CLIENT_BOOKS_BALANCE_NOTE,
  clientMatchNames,
} from "@/lib/client-related";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const party = await prisma.party.findUnique({
    where: { id },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      gstin: true,
      email: true,
      openingBalance: true,
      openingDrCr: true,
    },
  });
  if (!party) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const names = clientMatchNames(party);
  const quoteOr: Prisma.QuoteWhereInput[] = [
    { rfq: { is: { partyId: party.id } } },
    ...names.map((name) => ({
      buyerCompany: { equals: name, mode: "insensitive" as const },
    })),
  ];
  if (party.gstin) {
    quoteOr.push({
      buyerGstin: { equals: party.gstin, mode: "insensitive" },
    });
  }
  if (party.email) {
    quoteOr.push({
      buyerEmail: { equals: party.email, mode: "insensitive" },
    });
  }

  const leadOr: Prisma.RfqWhereInput[] = [
    { partyId: party.id },
    ...names.map((name) => ({
      customerCompany: { equals: name, mode: "insensitive" as const },
    })),
  ];
  if (party.email) {
    leadOr.push({
      customerEmail: { equals: party.email, mode: "insensitive" },
    });
  }

  const quoteWhere: Prisma.QuoteWhereInput = { OR: quoteOr };
  const leadWhere: Prisma.RfqWhereInput = { OR: leadOr };

  const [quotes, quoteCount, leads, leadCount, invoices, invoiceCount] =
    await Promise.all([
      prisma.quote.findMany({
        where: quoteWhere,
        orderBy: { updatedAt: "desc" },
        take: 15,
        select: {
          id: true,
          quoteNumber: true,
          quoteName: true,
          status: true,
          grandTotal: true,
          updatedAt: true,
          buyerCompany: true,
        },
      }),
      prisma.quote.count({ where: quoteWhere }),
      prisma.rfq.findMany({
        where: leadWhere,
        orderBy: { updatedAt: "desc" },
        take: 15,
        select: {
          id: true,
          leadNumber: true,
          customerCompany: true,
          customerName: true,
          leadStage: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.rfq.count({ where: leadWhere }),
      prisma.invoice.findMany({
        where: { partyId: party.id },
        orderBy: { issueDate: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          status: true,
          issueDate: true,
          total: true,
          balanceDue: true,
        },
      }),
      prisma.invoice.count({ where: { partyId: party.id } }),
    ]);

  return NextResponse.json({
    quotes: quotes.map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      quoteName: quote.quoteName,
      status: quote.status,
      buyerCompany: quote.buyerCompany,
      grandTotal: decimalToNumber(quote.grandTotal),
      updatedAt: quote.updatedAt.toISOString(),
    })),
    quoteCount,
    leads: leads.map((lead) => ({
      id: lead.id,
      leadNumber: lead.leadNumber,
      customerCompany: lead.customerCompany,
      customerName: lead.customerName,
      leadStage: lead.leadStage,
      status: lead.status,
      updatedAt: lead.updatedAt.toISOString(),
    })),
    leadCount,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      issueDate: invoice.issueDate.toISOString(),
      total: decimalToNumber(invoice.total),
      balanceDue: decimalToNumber(invoice.balanceDue),
    })),
    invoiceCount,
    openingBalance: decimalToNumber(party.openingBalance),
    openingDrCr: party.openingDrCr,
    booksNote: CLIENT_BOOKS_BALANCE_NOTE,
  });
}
