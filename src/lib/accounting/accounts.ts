import type { Prisma } from "@prisma/client";
import { AccountingError } from "@/lib/accounting/errors";

type Tx = Prisma.TransactionClient;

const SYSTEM_KEYS = [
  "CASH",
  "BANK",
  "ACCOUNTS_RECEIVABLE",
  "INVENTORY",
  "OUTPUT_GST",
  "SALES",
  "COGS",
] as const;

export type SystemAccountKey = (typeof SYSTEM_KEYS)[number];

export async function getSystemAccount(
  tx: Tx,
  legalEntityId: string,
  systemKey: SystemAccountKey
) {
  const account = await tx.chartOfAccount.findFirst({
    where: { legalEntityId, systemKey, active: true, allowPosting: true },
  });
  if (!account) {
    throw new AccountingError(`Chart account ${systemKey} not configured.`, "ACCOUNT_NOT_FOUND", 500);
  }
  return account;
}

export async function getSystemAccounts(
  tx: Tx,
  legalEntityId: string,
  keys: SystemAccountKey[]
) {
  const accounts = await tx.chartOfAccount.findMany({
    where: { legalEntityId, systemKey: { in: keys }, active: true, allowPosting: true },
  });
  const byKey = new Map(accounts.map((a) => [a.systemKey, a]));
  for (const key of keys) {
    if (!byKey.has(key)) {
      throw new AccountingError(`Chart account ${key} not configured.`, "ACCOUNT_NOT_FOUND", 500);
    }
  }
  return byKey as Map<SystemAccountKey, (typeof accounts)[number]>;
}
