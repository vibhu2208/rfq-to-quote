import { prisma } from "@/lib/prisma";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { toNumber, round2 } from "@/lib/accounting/money";

export async function getTrialBalance(asOf?: Date) {
  const ctx = await getDefaultOrgContext();
  const entries = await prisma.journalEntry.findMany({
    where: {
      organisationId: ctx.organisationId,
      status: "POSTED",
      ...(asOf ? { entryDate: { lte: asOf } } : {}),
    },
    include: { lines: { include: { account: true } } },
  });

  const map = new Map<
    string,
    { accountId: string; code: string; name: string; type: string; debit: number; credit: number }
  >();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const row = map.get(line.accountId) ?? {
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        debit: 0,
        credit: 0,
      };
      row.debit = round2(row.debit + toNumber(line.debit));
      row.credit = round2(row.credit + toNumber(line.credit));
      map.set(line.accountId, row);
    }
  }

  const rows = [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.02 };
}

export async function getArAgeing() {
  const ctx = await getDefaultOrgContext();
  const invoices = await prisma.invoice.findMany({
    where: {
      organisationId: ctx.organisationId,
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      balanceDue: { gt: 0 },
    },
    include: { party: true },
    orderBy: { issueDate: "asc" },
  });

  const today = new Date();
  return invoices.map((inv) => {
    const days = Math.floor(
      (today.getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const bucket =
      days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    return {
      invoiceId: inv.id,
      number: inv.number,
      partyName: inv.party.legalName,
      balanceDue: toNumber(inv.balanceDue),
      days,
      bucket,
    };
  });
}

export async function getStockBalances() {
  const ctx = await getDefaultOrgContext();
  return prisma.stockBalance.findMany({
    where: { warehouse: { organisationId: ctx.organisationId } },
    include: {
      product: { select: { id: true, code: true, name: true, unit: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
