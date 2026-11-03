import { Prisma } from "@prisma/client";

type CostLine = {
  sortOrder: number;
  costPrice?: number | null;
  costVendorName?: string;
};

type SqlTx = {
  $executeRaw: (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function persistQuoteLineVendorCosts(
  tx: SqlTx,
  quoteId: string,
  lines: CostLine[]
) {
  const priced = lines
    .map((line) => ({
      sortOrder: line.sortOrder,
      cost:
        line.costPrice != null && Number.isFinite(line.costPrice) && line.costPrice > 0
          ? line.costPrice
          : null,
      vendor: line.costVendorName?.trim() || "",
    }))
    .filter((line) => line.cost != null || line.vendor !== "");

  if (priced.length === 0) return;

  const values = Prisma.join(
    priced.map(
      (line) => Prisma.sql`(${line.sortOrder}::int, ${line.cost}::numeric, ${line.vendor}::text)`
    )
  );

  await tx.$executeRaw`
    UPDATE "QuoteLineItem" AS li
    SET
      "costPrice" = v.cost,
      "costVendorName" = v.vendor
    FROM (VALUES ${values}) AS v(sort, cost, vendor)
    WHERE li."quoteId" = ${quoteId} AND li."sortOrder" = v.sort
  `;
}
