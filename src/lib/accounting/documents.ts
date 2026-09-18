import type { DocumentType, Prisma } from "@prisma/client";
import { AccountingError } from "@/lib/accounting/errors";

type Tx = Prisma.TransactionClient;

function formatDocumentNumber(prefix: string, suffix: string, number: bigint, padding: number): string {
  return `${prefix}${number.toString().padStart(padding, "0")}${suffix}`;
}

async function ensureDocumentSeries(
  tx: Tx,
  params: {
    organisationId: string;
    gstRegistrationId?: string;
    fiscalYearId?: string;
    documentType: DocumentType;
    code: string;
    prefix?: string;
  }
) {
  const existing = await tx.documentSeries.findFirst({
    where: {
      organisationId: params.organisationId,
      documentType: params.documentType,
      code: params.code,
      active: true,
    },
  });
  if (existing) return existing;

  return tx.documentSeries.create({
    data: {
      organisationId: params.organisationId,
      gstRegistrationId: params.gstRegistrationId,
      fiscalYearId: params.fiscalYearId,
      documentType: params.documentType,
      code: params.code,
      prefix: params.prefix ?? "",
      padding: 4,
      nextNumber: BigInt(1),
    },
  });
}

export async function allocateDocumentNumber(
  tx: Tx,
  params: {
    organisationId: string;
    gstRegistrationId?: string;
    fiscalYearId?: string;
    documentType: DocumentType;
    seriesCode: string;
    prefix?: string;
    idempotencyKey: string;
    sourceType?: string;
    sourceId?: string;
  }
): Promise<string> {
  const existingAllocation = await tx.documentNumberAllocation.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existingAllocation) return existingAllocation.formattedNumber;

  const series = await ensureDocumentSeries(tx, {
    organisationId: params.organisationId,
    gstRegistrationId: params.gstRegistrationId,
    fiscalYearId: params.fiscalYearId,
    documentType: params.documentType,
    code: params.seriesCode,
    prefix: params.prefix,
  });

  const updated = await tx.documentSeries.update({
    where: { id: series.id },
    data: { nextNumber: { increment: BigInt(1) } },
  });

  const allocatedNumber = updated.nextNumber - BigInt(1);
  const formattedNumber = formatDocumentNumber(
    updated.prefix,
    updated.suffix,
    allocatedNumber,
    updated.padding
  );

  await tx.documentNumberAllocation.create({
    data: {
      seriesId: series.id,
      number: allocatedNumber,
      formattedNumber,
      idempotencyKey: params.idempotencyKey,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      committedAt: new Date(),
    },
  });

  return formattedNumber;
}

export async function allocatePaymentNumber(
  tx: Tx,
  organisationId: string,
  idempotencyKey: string
): Promise<string> {
  const count = await tx.payment.count({ where: { organisationId } });
  const formatted = `RCP-${String(count + 1).padStart(5, "0")}`;

  const clash = await tx.payment.findFirst({
    where: { organisationId, number: formatted },
  });
  if (clash) {
    throw new AccountingError("Payment number collision; retry.", "PAYMENT_NUMBER_COLLISION", 409);
  }

  void idempotencyKey;
  return formatted;
}

export async function allocateJournalNumber(
  tx: Tx,
  legalEntityId: string,
  idempotencyKey: string
): Promise<string> {
  const existing = await tx.journalEntry.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing.number;

  const count = await tx.journalEntry.count({ where: { legalEntityId } });
  return `JV-${String(count + 1).padStart(5, "0")}`;
}

export const DRAFT_INVOICE_NUMBER_PREFIX = "DRAFT-";

export function isDraftInvoiceNumber(number: string): boolean {
  return number.startsWith(DRAFT_INVOICE_NUMBER_PREFIX);
}
