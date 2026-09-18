import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = Prisma.TransactionClient | PrismaClient;

/** Indian FY: 1 Apr – 31 Mar. Label e.g. 2025-26 */
export function getIndianFiscalYearBounds(date: Date): {
  startsOn: Date;
  endsOn: Date;
  label: string;
  name: string;
} {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const startYear = m >= 3 ? y : y - 1;
  const startsOn = new Date(Date.UTC(startYear, 3, 1));
  const endsOn = new Date(Date.UTC(startYear + 1, 2, 31));
  const label = `${startYear}-${String(startYear + 1).slice(-2)}`;
  return { startsOn, endsOn, label, name: `FY ${label}` };
}

async function resolvePrimaryLegalEntityId(
  tx: DbClient,
  organisationId: string
): Promise<string> {
  const legalEntity = await tx.legalEntity.findFirst({
    where: { organisationId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!legalEntity) {
    throw new Error(`No active legal entity found for organisation ${organisationId}`);
  }
  return legalEntity.id;
}

export type EnsureOpenPeriodResult = {
  fiscalYearId: string;
  fiscalPeriodId: string;
  fiscalYearLabel: string;
  legalEntityId: string;
};

export async function ensureOpenPeriod(
  tx: DbClient,
  organisationId: string,
  date: Date
): Promise<EnsureOpenPeriodResult>;
export async function ensureOpenPeriod(
  tx: DbClient,
  input: { organisationId: string; legalEntityId: string; date: Date }
): Promise<EnsureOpenPeriodResult>;
export async function ensureOpenPeriod(
  tx: DbClient,
  organisationIdOrInput: string | { organisationId: string; legalEntityId: string; date: Date },
  maybeDate?: Date
): Promise<EnsureOpenPeriodResult> {
  const input =
    typeof organisationIdOrInput === "string"
      ? {
          organisationId: organisationIdOrInput,
          legalEntityId: await resolvePrimaryLegalEntityId(tx, organisationIdOrInput),
          date: maybeDate ?? new Date(),
        }
      : organisationIdOrInput;

  const { startsOn, endsOn, label, name } = getIndianFiscalYearBounds(input.date);

  let fy = await tx.fiscalYear.findFirst({
    where: {
      legalEntityId: input.legalEntityId,
      startsOn,
    },
    include: { periods: true },
  });

  if (!fy) {
    fy = await tx.fiscalYear.create({
      data: {
        organisationId: input.organisationId,
        legalEntityId: input.legalEntityId,
        name,
        startsOn,
        endsOn,
        periods: {
          create: Array.from({ length: 12 }, (_, i) => {
            const pStart = new Date(Date.UTC(startsOn.getUTCFullYear(), 3 + i, 1));
            const pEnd = new Date(Date.UTC(startsOn.getUTCFullYear(), 4 + i, 0));
            return {
              number: i + 1,
              name: pStart.toLocaleString("en-IN", {
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }),
              startsOn: pStart,
              endsOn: pEnd,
              status: "OPEN" as const,
            };
          }),
        },
      },
      include: { periods: true },
    });
  }

  const day = new Date(
    Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate())
  );
  const period = fy.periods.find((p) => p.startsOn <= day && p.endsOn >= day);
  if (!period) {
    throw new Error(`No fiscal period covers ${day.toISOString().slice(0, 10)}`);
  }
  if (period.status === "LOCKED" || period.status === "CLOSED") {
    throw new Error(`Fiscal period ${period.name} is ${period.status}`);
  }

  return {
    fiscalYearId: fy.id,
    fiscalPeriodId: period.id,
    fiscalYearLabel: label,
    legalEntityId: input.legalEntityId,
  };
}
