import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { getGspProvider } from "@/lib/accounting/gsp";
import { writeAuditEvent } from "@/lib/accounting/audit";
import { toNumber } from "@/lib/accounting/money";
import type { Prisma } from "@prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * E-invoice / return filing always requires explicit approvedByUserId.
 */
export async function submitEInvoiceWithApproval(input: {
  invoiceId: string;
  approvedByUserId: string;
}) {
  if (!input.approvedByUserId) {
    throw new Error("Explicit approver required for e-invoice submission");
  }

  const ctx = await getDefaultOrgContext();
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: input.invoiceId },
    include: { lines: true, party: true },
  });
  if (invoice.status === "DRAFT") {
    throw new Error("Issue the tax invoice before e-invoice registration");
  }

  const existing = await prisma.eInvoiceRecord.findFirst({
    where: { invoiceId: invoice.id, status: "GENERATED" },
  });
  if (existing?.irn) return existing;

  const payload = {
    Gstin: ctx.gstin,
    DocDtls: {
      Typ: "INV",
      No: invoice.number,
      Dt: invoice.issueDate.toISOString().slice(0, 10),
    },
    BuyerDtls: {
      Gstin: invoice.party.gstin,
      LglNm: invoice.party.legalName,
      Pos: invoice.placeOfSupplyCode,
    },
    ItemList: invoice.lines.map((l) => ({
      HsnCd: l.hsnCode,
      Qty: toNumber(l.quantity),
      UnitPrice: toNumber(l.unitPrice),
      TotAmt: toNumber(l.lineTotal),
    })),
    ValDtls: {
      AssVal: toNumber(invoice.subtotal),
      IgstVal: invoice.lines.reduce((s, l) => s + toNumber(l.igstAmount), 0),
      CgstVal: invoice.lines.reduce((s, l) => s + toNumber(l.cgstAmount), 0),
      SgstVal: invoice.lines.reduce((s, l) => s + toNumber(l.sgstAmount), 0),
      TotInvVal: toNumber(invoice.total),
    },
  };

  const result = await getGspProvider().generateEInvoice({
    gstin: ctx.gstin,
    invoiceNumber: invoice.number,
    invoiceDate: invoice.issueDate.toISOString().slice(0, 10),
    payload,
    idempotencyKey: `einvoice-${invoice.id}`,
    approvedByUserId: input.approvedByUserId,
  });

  const record = await prisma.eInvoiceRecord.create({
    data: {
      gstRegistrationId: ctx.gstRegistrationId,
      invoiceId: invoice.id,
      status:
        result.status === "GENERATED"
          ? "GENERATED"
          : result.status === "SKIPPED"
            ? "PENDING"
            : "FAILED",
      irn: result.irn,
      acknowledgementNumber: result.acknowledgementNumber,
      acknowledgementDate: result.status === "GENERATED" ? new Date() : null,
      signedQrCode: result.signedQrCode,
      requestPayload: asJson(result.requestPayload),
      responsePayload: asJson(result.responsePayload),
    },
  });

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: input.approvedByUserId,
    action: "EINVOICE_SUBMITTED",
    entityType: "EInvoiceRecord",
    entityId: record.id,
    after: { status: record.status, irn: record.irn },
  });

  return record;
}

export async function submitGstReturnWithApproval(input: {
  gstReturnId: string;
  approvedByUserId: string;
}) {
  if (!input.approvedByUserId) {
    throw new Error("Explicit approver required for GST filing");
  }

  const ctx = await getDefaultOrgContext();
  const gstReturn = await prisma.gstReturn.findUniqueOrThrow({
    where: { id: input.gstReturnId },
  });
  if (gstReturn.status === "FILED" || gstReturn.status === "ACCEPTED") {
    return gstReturn;
  }
  if (gstReturn.status === "DRAFT") {
    throw new Error("Prepare and validate the return before filing");
  }

  const attempt =
    (await prisma.gstSubmission.count({ where: { gstReturnId: gstReturn.id } })) + 1;

  const result = await getGspProvider().submitReturn({
    gstin: ctx.gstin,
    returnType: gstReturn.type === "GSTR3B" ? "GSTR3B" : "GSTR1",
    period: gstReturn.period,
    payload: gstReturn.payload as Record<string, unknown>,
    idempotencyKey: `file-${gstReturn.id}-${attempt}`,
    approvedByUserId: input.approvedByUserId,
  });

  await prisma.gstSubmission.create({
    data: {
      gstReturnId: gstReturn.id,
      attempt,
      status:
        result.status === "ACCEPTED" || result.status === "SUBMITTED"
          ? "FILED"
          : result.status === "SKIPPED"
            ? "PREPARED"
            : "REJECTED",
      requestPayload: asJson(result.requestPayload),
      responsePayload: asJson(result.responsePayload),
      acknowledgementRef: result.acknowledgementRef,
    },
  });

  const updated =
    result.status === "ACCEPTED" || result.status === "SUBMITTED"
      ? await prisma.gstReturn.update({
          where: { id: gstReturn.id },
          data: {
            status: "FILED",
            filedAt: new Date(),
            arn: result.acknowledgementRef,
          },
        })
      : gstReturn;

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: input.approvedByUserId,
    action: "GST_RETURN_SUBMITTED",
    entityType: "GstReturn",
    entityId: gstReturn.id,
    after: { status: updated.status, arn: updated.arn, providerStatus: result.status },
  });

  return updated;
}
