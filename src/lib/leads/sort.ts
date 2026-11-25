import type { Prisma } from "@prisma/client";

export type LeadListSort =
  | "created"
  | "updated"
  | "expected"
  | "followUp"
  | "priority"
  | "sla";

export function parseLeadListSort(raw: string | null): LeadListSort {
  if (
    raw === "created" ||
    raw === "updated" ||
    raw === "expected" ||
    raw === "followUp" ||
    raw === "priority" ||
    raw === "sla"
  ) {
    return raw;
  }
  return "created";
}

export function parseLeadListSortDir(raw: string | null): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

export function leadListOrderBy(
  sort: LeadListSort,
  dir: "asc" | "desc"
): Prisma.RfqOrderByWithRelationInput[] {
  switch (sort) {
    case "updated":
      return [{ updatedAt: dir }, { id: "asc" }];
    case "expected":
      return [{ expectedClosureAt: { sort: dir, nulls: "last" } }, { id: "asc" }];
    case "followUp":
      return [{ nextFollowUpAt: { sort: dir, nulls: "last" } }, { id: "asc" }];
    case "priority":
      return [{ priority: dir }, { updatedAt: "desc" }, { id: "asc" }];
    case "sla":
      return [{ slaDueAt: { sort: dir, nulls: "last" } }, { id: "asc" }];
    default:
      return [{ createdAt: dir }, { id: "asc" }];
  }
}

export function leadListSortNext(
  current: LeadListSort | "",
  column: LeadListSort,
  currentDir: "asc" | "desc"
): { sort: LeadListSort; dir: "asc" | "desc" } {
  const active = current === column;
  const defaultDir: "asc" | "desc" =
    column === "created" || column === "updated" ? "desc" : "asc";
  return {
    sort: column,
    dir: active ? (currentDir === "asc" ? "desc" : "asc") : defaultDir,
  };
}