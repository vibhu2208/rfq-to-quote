import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { toNumber, round2 } from "@/lib/accounting/money";
import { writeAuditEvent } from "@/lib/accounting/audit";
import type { Prisma } from "@prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Build GSTR-1 style outward supply draft from issued invoices in period YYYY-MM */
export async function prepareGstr1Draft(period: string, userId?: string) {
  const ctx = await getDefaultOrgContext();
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) throw new Error("period must be YYYY-MM");

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const invoices = await prisma.invoice.findMany({
    where: {
      gstRegistrationId: ctx.gstRegistrationId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
      issueDate: { gte: start, lte: end },
    },
    include: { lines: true, party: true },
  });

  const b2b: unknown[] = [];
  const b2cs: unknown[] = [];
  let taxable = 0;
  let igst = 0;
  let cgst = 0;
  let sgst = 0;

  for (const inv of invoices) {
    const lineCgst = round2(inv.lines.reduce((s, l) => s + toNumber(l.cgstAmount), 0));
    const lineSgst = round2(inv.lines.reduce((s, l) => s + toNumber(l.sgstAmount), 0));
    const lineIgst = round2(inv.lines.reduce((s, l) => s + toNumber(l.igstAmount), 0));
    const lineTaxable = round2(inv.lines.reduce((s, l) => s + toNumber(l.taxableValue), 0));
    taxable = round2(taxable + lineTaxable);
    cgst = round2(cgst + lineCgst);
    sgst = round2(sgst + lineSgst);
    igst = round2(igst + lineIgst);

    const row = {
      invoiceId: inv.id,
      inum: inv.number,
      idt: inv.issueDate.toISOString().slice(0, 10),
      val: toNumber(inv.total),
      pos: inv.placeOfSupplyCode,
      ctin: inv.party.gstin,
      taxable: lineTaxable,
      cgst: lineCgst,
      sgst: lineSgst,
      igst: lineIgst,
    };
    if (inv.party.gstin) b2b.push(row);
    else b2cs.push(row);
  }

  const summary = { taxable, cgst, sgst, igst, invoiceCount: invoices.length };
  const payload = { period, gstin: ctx.gstin, b2b, b2cs, summary };

  const existing = await prisma.gstReturn.findFirst({
    where: {
      gstRegistrationId: ctx.gstRegistrationId,
      type: "GSTR1",
      period,
    },
    orderBy: { version: "desc" },
  });

  const version = (existing?.version ?? 0) + 1;
  const draft = await prisma.gstReturn.create({
    data: {
      gstRegistrationId: ctx.gstRegistrationId,
      type: "GSTR1",
      period,
      status: "PREPARED",
      payload: asJson(payload),
      summary: asJson(summary),
      preparedAt: new Date(),
      version,
      supersedesId: existing?.id,
    },
  });

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: userId,
    action: "GSTR1_PREPARED",
    entityType: "GstReturn",
    entityId: draft.id,
    after: summary,
  });

  return draft;
}

/** Import GSTR-2B portal rows and match to purchase-side invoices (MVP: match by invoice number/GSTIN). */
export async function importGstr2bAndReconcile(
  rows: Array<{
    supplierGstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    taxable?: number;
    igst?: number;
    cgst?: number;
    sgst?: number;
    externalRef?: string;
  }>,
  userId?: string
) {
  const ctx = await getDefaultOrgContext();
  const results = [];

  for (const row of rows) {
    const invoice = row.invoiceNumber
      ? await prisma.invoice.findFirst({
          where: {
            gstRegistrationId: ctx.gstRegistrationId,
            number: row.invoiceNumber,
          },
        })
      : null;

    let status: "MATCHED" | "UNMATCHED" | "MISMATCH" | "PARTIAL" = "UNMATCHED";
    const bookValues = invoice
      ? {
          taxable: toNumber(invoice.subtotal),
          tax: toNumber(invoice.taxAmount),
          total: toNumber(invoice.total),
        }
      : {};
    const portalValues = {
      taxable: row.taxable,
      igst: row.igst,
      cgst: row.cgst,
      sgst: row.sgst,
      supplierGstin: row.supplierGstin,
    };

    if (invoice && row.taxable != null) {
      const diff = Math.abs(toNumber(invoice.subtotal) - row.taxable);
      status = diff < 1 ? "MATCHED" : diff < 100 ? "PARTIAL" : "MISMATCH";
    }

    const rec = await prisma.gstReconciliation.create({
      data: {
        gstRegistrationId: ctx.gstRegistrationId,
        invoiceId: invoice?.id,
        externalInvoiceRef: row.externalRef || row.invoiceNumber || null,
        status,
        bookValues: asJson(bookValues),
        portalValues: asJson(portalValues),
        differences: asJson({
          taxableDiff:
            invoice && row.taxable != null ? toNumber(invoice.subtotal) - row.taxable : null,
        }),
      },
    });
    results.push(rec);
  }

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: userId,
    action: "GSTR2B_IMPORTED",
    entityType: "GstReconciliation",
    entityId: ctx.gstRegistrationId,
    metadata: { count: results.length },
  });

  return results;
}

export async function prepareGstr3bSummary(period: string) {
  const gstr1 = await prepareGstr1Draft(period);
  const summary = gstr1.summary as {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  };

  const ctx = await getDefaultOrgContext();
  return prisma.gstReturn.create({
    data: {
      gstRegistrationId: ctx.gstRegistrationId,
      type: "GSTR3B",
      period,
      status: "PREPARED",
      payload: asJson({
        outward: summary,
        note: "ITC and inward supplies require purchase books; MVP outward-only draft",
      }),
      summary: asJson({
        outwardTaxable: summary.taxable,
        outwardTax: round2(summary.cgst + summary.sgst + summary.igst),
      }),
      preparedAt: new Date(),
      version: 1,
    },
  });
}
