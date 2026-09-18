import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { writeAuditEvent } from "@/lib/accounting/audit";
import type { DocumentType, Prisma } from "@prisma/client";

/**
 * Canonical transaction draft capture — AI/OCR/CSV feed this contract.
 * Statutory calculation never happens here; posting services use tax-engine.
 */
export async function createTransactionDraft(input: {
  type: DocumentType;
  payload: Record<string, unknown>;
  partyId?: string;
  sourceDocumentId?: string;
  documentExtractionId?: string;
  documentDate?: Date;
  userId?: string;
  fieldConfidence?: Record<string, number>;
}) {
  const ctx = await getDefaultOrgContext();
  const confidence = input.fieldConfidence ?? {};
  const lowConfidenceFields = Object.entries(confidence)
    .filter(([, v]) => v < 0.7)
    .map(([k]) => k);

  const status = lowConfidenceFields.length > 0 ? "NEEDS_REVIEW" : "DRAFT";

  const draft = await prisma.transactionDraft.create({
    data: {
      organisationId: ctx.organisationId,
      type: input.type,
      partyId: input.partyId,
      sourceDocumentId: input.sourceDocumentId,
      documentExtractionId: input.documentExtractionId,
      documentDate: input.documentDate,
      status,
      payload: {
        ...input.payload,
        fieldConfidence: confidence,
      } as Prisma.InputJsonValue,
      validations: {
        create: lowConfidenceFields.map((field) => ({
          code: "LOW_CONFIDENCE",
          severity: "WARNING" as const,
          message: `Field ${field} confidence below threshold`,
          fieldPath: field,
        })),
      },
    },
    include: { validations: true, lines: true },
  });

  await writeAuditEvent({
    organisationId: ctx.organisationId,
    actorUserId: input.userId,
    action: "TRANSACTION_DRAFT_CREATED",
    entityType: "TransactionDraft",
    entityId: draft.id,
    metadata: { status, lowConfidenceFields },
  });

  return draft;
}

/** Simple natural-language sale draft: "sold 2 CCTV-CAM-DOME to Acme at 1100" */
export async function createDraftFromNaturalLanguage(text: string, userId?: string) {
  const ctx = await getDefaultOrgContext();
  const products = await prisma.product.findMany({
    where: { organisationId: ctx.organisationId, active: true },
  });

  const matched = products.find((p) =>
    text.toLowerCase().includes(p.code.toLowerCase()) ||
    text.toLowerCase().includes(p.name.toLowerCase())
  );

  const qtyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:pcs|nos|units|x)?/i);
  const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

  return createTransactionDraft({
    type: "TAX_INVOICE",
    userId,
    fieldConfidence: {
      product: matched ? 0.85 : 0.4,
      quantity: qtyMatch ? 0.8 : 0.5,
      rawText: 0.9,
    },
    payload: {
      channel: "natural_language",
      rawText: text,
      suggestedProductId: matched?.id,
      suggestedProductCode: matched?.code,
      quantity: qty,
      unitPrice: matched ? Number(matched.offerPrice) : null,
    },
  });
}

export async function createDraftFromCsvRows(
  rows: Array<Record<string, string>>,
  userId?: string
) {
  const drafts = [];
  for (const [index, row] of rows.entries()) {
    const draft = await createTransactionDraft({
      type: "TAX_INVOICE",
      userId,
      fieldConfidence: {
        invoiceNumber: row.invoiceNumber ? 0.9 : 0.3,
        amount: row.amount ? 0.85 : 0.3,
      },
      payload: { channel: "csv", rowIndex: index, row },
    });
    drafts.push(draft);
  }
  return drafts;
}
