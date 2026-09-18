import type { DocumentType, Prisma } from "@prisma/client";
import { allocateDocumentNumber } from "@/lib/accounting/documents";

/** @deprecated Use allocateDocumentNumber from documents.ts */
export async function allocateNextNumber(
  tx: Prisma.TransactionClient,
  input: {
    organisationId: string;
    gstRegistrationId?: string | null;
    documentType: DocumentType;
    fiscalYearId?: string | null;
    fiscalYearLabel?: string;
    prefix: string;
    seriesCode?: string;
    idempotencyKey?: string;
    sourceType?: string;
    sourceId?: string;
  }
): Promise<{ number: string; seriesId: string; sequence: number }> {
  const seriesCode = input.seriesCode ?? `${input.prefix}-${input.documentType}`;
  const idempotencyKey = input.idempotencyKey ?? `${seriesCode}-${Date.now()}`;

  const number = await allocateDocumentNumber(tx, {
    organisationId: input.organisationId,
    gstRegistrationId: input.gstRegistrationId ?? undefined,
    fiscalYearId: input.fiscalYearId ?? undefined,
    documentType: input.documentType,
    seriesCode,
    prefix: input.prefix,
    idempotencyKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  const allocation = await tx.documentNumberAllocation.findUniqueOrThrow({
    where: { idempotencyKey },
    select: { seriesId: true, number: true },
  });

  return {
    number,
    seriesId: allocation.seriesId,
    sequence: Number(allocation.number),
  };
}
