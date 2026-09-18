import type { Prisma } from "@prisma/client";
import { round2, toNumber } from "@/lib/accounting/money";
import { allocateNextNumber } from "@/lib/accounting/document-series";
import { ensureOpenPeriod } from "@/lib/accounting/fiscal";

export type JournalLineInput = {
  accountId: string;
  partyId?: string | null;
  description?: string;
  debit?: number;
  credit?: number;
};

export async function getAccountBySystemKey(
  tx: Prisma.TransactionClient,
  legalEntityId: string,
  systemKey: string
) {
  const account = await tx.chartOfAccount.findFirst({
    where: { legalEntityId, systemKey, active: true },
  });
  if (!account) throw new Error(`Chart account missing systemKey=${systemKey}`);
  return account;
}

export async function postBalancedJournal(
  tx: Prisma.TransactionClient,
  input: {
    organisationId: string;
    legalEntityId: string;
    entryDate: Date;
    sourceType: string;
    sourceId?: string;
    narration?: string;
    idempotencyKey?: string;
    lines: JournalLineInput[];
  }
) {
  if (input.idempotencyKey) {
    const existing = await tx.journalEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) return existing;
  }

  const normalized = input.lines.map((l, i) => {
    const debit = round2(Math.max(0, l.debit ?? 0));
    const credit = round2(Math.max(0, l.credit ?? 0));
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new Error(`Journal line ${i + 1} must have either debit or credit`);
    }
    return { ...l, debit, credit };
  });

  const totalDebit = round2(normalized.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(normalized.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced journal: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const period = await ensureOpenPeriod(tx, {
    organisationId: input.organisationId,
    legalEntityId: input.legalEntityId,
    date: input.entryDate,
  });

  const { number } = await allocateNextNumber(tx, {
    organisationId: input.organisationId,
    documentType: "JOURNAL_VOUCHER",
    fiscalYearId: period.fiscalYearId,
    fiscalYearLabel: period.fiscalYearLabel,
    prefix: "JV",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    idempotencyKey: input.idempotencyKey ? `jv-${input.idempotencyKey}` : undefined,
  });

  return tx.journalEntry.create({
    data: {
      organisationId: input.organisationId,
      legalEntityId: input.legalEntityId,
      fiscalYearId: period.fiscalYearId,
      fiscalPeriodId: period.fiscalPeriodId,
      number,
      status: "POSTED",
      entryDate: input.entryDate,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      narration: input.narration ?? "",
      idempotencyKey: input.idempotencyKey,
      postedAt: new Date(),
      lines: {
        create: normalized.map((l, i) => ({
          lineNumber: i + 1,
          accountId: l.accountId,
          partyId: l.partyId ?? null,
          description: l.description ?? "",
          debit: l.debit,
          credit: l.credit,
        })),
      },
    },
    include: { lines: true },
  });
}

export async function reverseJournal(
  tx: Prisma.TransactionClient,
  entryId: string,
  reason: string
) {
  const entry = await tx.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { lines: true },
  });
  if (entry.status !== "POSTED") throw new Error("Only posted journals can be reversed");
  if (entry.reversedEntryId) throw new Error("Journal already reversed");

  const reversal = await postBalancedJournal(tx, {
    organisationId: entry.organisationId,
    legalEntityId: entry.legalEntityId,
    entryDate: new Date(),
    sourceType: "JOURNAL_REVERSAL",
    sourceId: entry.id,
    narration: `Reversal of ${entry.number}: ${reason}`,
    idempotencyKey: `rev-${entry.id}`,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      partyId: l.partyId,
      description: l.description,
      debit: toNumber(l.credit),
      credit: toNumber(l.debit),
    })),
  });

  await tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: "REVERSED", reversedEntryId: reversal.id },
  });

  return reversal;
}
