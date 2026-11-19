import type { Prisma, TelemarketingCallStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { telemarketingSearchPattern } from "@/lib/telemarketing/search";

export type BuildTelemarketingListWhereOptions = {
  /** Status tab counts should ignore the active status filter. */
  omitCallStatus?: boolean;
};

export function buildTelemarketingListWhere(
  params: URLSearchParams,
  options: BuildTelemarketingListWhereOptions = {}
): Prisma.TelemarketingContactWhereInput {
  const status = params.get("status") as TelemarketingCallStatus | "ALL" | null;
  const source = params.get("source");
  const view = params.get("view") || "active";
  const assignee = params.get("assignee");
  const tag = params.get("tag")?.trim();
  const primaryContactId = params.get("primaryContactId");

  if (primaryContactId) {
    return { primaryContactId, archivedAt: null };
  }

  const where: Prisma.TelemarketingContactWhereInput = {
    primaryContactId: null,
  };

  if (view === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  if (source === "MANUAL" || source === "IMPORTED") {
    where.source = source;
  }

  if (!options.omitCallStatus && status && status !== "ALL") {
    where.callStatus = status;
  }

  if (assignee === "unassigned") {
    where.assignedToUserId = null;
  } else if (assignee) {
    where.assignedToUserId = assignee;
  }

  if (tag) {
    where.tags = { array_contains: tag };
  }

  return where;
}

const NO_TEXT_SEARCH_MATCH_ID = "__telemarketing_no_text_match__";

export async function applyTelemarketingTextSearch(
  prisma: PrismaClient,
  where: Prisma.TelemarketingContactWhereInput,
  q: string
): Promise<Prisma.TelemarketingContactWhereInput> {
  const trimmed = q.trim();
  if (!trimmed) return where;

  const pattern = telemarketingSearchPattern(trimmed);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TelemarketingContact"
    WHERE "name" ILIKE ${pattern} ESCAPE '\\'
       OR "company" ILIKE ${pattern} ESCAPE '\\'
       OR "phone" ILIKE ${pattern} ESCAPE '\\'
       OR "email" ILIKE ${pattern} ESCAPE '\\'
       OR "role" ILIKE ${pattern} ESCAPE '\\'
  `;
  const ids = rows.map((row) => row.id);
  const andPrev = where.AND
    ? Array.isArray(where.AND)
      ? where.AND
      : [where.AND]
    : [];

  return {
    ...where,
    AND: [
      ...andPrev,
      { id: { in: ids.length ? ids : [NO_TEXT_SEARCH_MATCH_ID] } },
    ],
  };
}