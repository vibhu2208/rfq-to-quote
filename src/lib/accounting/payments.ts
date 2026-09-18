import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { allocateNextNumber } from "@/lib/accounting/document-series";
import { ensureOpenPeriod } from "@/lib/accounting/fiscal";
import { getAccountBySystemKey, postBalancedJournal } from "@/lib/accounting/journals";
import { writeAuditEvent } from "@/lib/accounting/audit";
import { round2, toNumber } from "@/lib/accounting/money";

export async function createReceipt(input: {
  partyId: string;
  amount: number;
  accountId?: string;
  method?: "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "CHEQUE" | "DEMAND_DRAFT" | "OTHER";
  paymentDate?: Date;
  reference?: string;
  idempotencyKey?: string;
  allocations: Array<{ invoiceId: string; amount: number }>;
  userId?: string;
}) {
  return createCustomerReceipt(input);
}

export async function createCustomerReceipt(input: {
  partyId: string;
  amount: number;
  accountId?: string;
  method?: "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "CHEQUE" | "DEMAND_DRAFT" | "OTHER";
  paymentDate?: Date;
  reference?: string;
  idempotencyKey?: string;
  allocations: Array<{ invoiceId: string; amount: number }>;
  userId?: string;
}) {
  const ctx = await getDefaultOrgContext();
  const amount = round2(input.amount);
  if (amount <= 0) throw new Error("Receipt amount must be positive");

  const allocTotal = round2(input.allocations.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(allocTotal - amount) > 0.01) {
    throw new Error(`Allocations ${allocTotal} must equal receipt amount ${amount}`);
  }

  const period = await ensureOpenPeriod(prisma, {
    organisationId: ctx.organisationId,
    legalEntityId: ctx.legalEntityId,
    date: input.paymentDate ?? new Date(),
  });

  return prisma.$transaction(
    async (tx) => {
    const { number } = await allocateNextNumber(tx, {
      organisationId: ctx.organisationId,
      documentType: "PAYMENT_RECEIPT",
      fiscalYearId: period.fiscalYearId,
      fiscalYearLabel: period.fiscalYearLabel,
      prefix: "RCT",
      sourceType: "Payment",
    });

    const method = input.method ?? "BANK_TRANSFER";
    const cashOrBank = input.accountId
      ? await tx.chartOfAccount.findUniqueOrThrow({ where: { id: input.accountId } })
      : await getAccountBySystemKey(
          tx,
          ctx.legalEntityId,
          method === "CASH" ? "CASH" : "BANK"
        );
    const ar = await getAccountBySystemKey(tx, ctx.legalEntityId, "ACCOUNTS_RECEIVABLE");

    const payment = await tx.payment.create({
      data: {
        organisationId: ctx.organisationId,
        partyId: input.partyId,
        accountId: cashOrBank.id,
        number,
        direction: "RECEIPT",
        method,
        status: "CLEARED",
        paymentDate: input.paymentDate ?? new Date(),
        amount,
        reference: input.reference,
        clearedAt: new Date(),
        allocations: {
          create: input.allocations.map((a) => ({
            invoiceId: a.invoiceId,
            amount: round2(a.amount),
          })),
        },
      },
      include: { allocations: true },
    });

    for (const alloc of input.allocations) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
      if (invoice.partyId !== input.partyId) {
        throw new Error(`Invoice ${invoice.number} does not belong to party`);
      }
      const due = toNumber(invoice.balanceDue);
      if (round2(alloc.amount) - due > 0.01) {
        throw new Error(`Allocation exceeds balance on ${invoice.number}`);
      }
      const nextDue = round2(due - alloc.amount);
      const status =
        nextDue <= 0.009 ? "PAID" : nextDue < toNumber(invoice.total) ? "PARTIALLY_PAID" : invoice.status;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { balanceDue: Math.max(0, nextDue), status },
      });
    }

    await postBalancedJournal(tx, {
      organisationId: ctx.organisationId,
      legalEntityId: ctx.legalEntityId,
      entryDate: input.paymentDate ?? new Date(),
      sourceType: "Payment",
      sourceId: payment.id,
      narration: `Receipt ${number}`,
      idempotencyKey: `receipt-${payment.id}`,
      lines: [
        { accountId: cashOrBank.id, debit: amount, description: `Receipt ${number}` },
        {
          accountId: ar.id,
          partyId: input.partyId,
          credit: amount,
          description: `AR clearance ${number}`,
        },
      ],
    });

    await writeAuditEvent({
      organisationId: ctx.organisationId,
      actorUserId: input.userId,
      action: "RECEIPT_CREATED",
      entityType: "Payment",
      entityId: payment.id,
      after: { number, amount },
      tx,
    });

    return payment;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
}

export function serializePayment(payment: {
  id: string;
  number: string;
  direction: string;
  method: string;
  status: string;
  paymentDate: Date;
  amount: unknown;
  reference?: string | null;
  party?: unknown;
  account?: unknown;
  allocations?: Array<{ amount: unknown; invoice?: unknown; invoiceId?: string }>;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    ...payment,
    amount: toNumber(payment.amount),
    allocations: (payment.allocations || []).map((a) => ({
      ...a,
      amount: toNumber(a.amount),
    })),
  };
}
