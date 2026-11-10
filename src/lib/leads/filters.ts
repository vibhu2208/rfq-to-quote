import type {
  LeadIntakeKind,
  LeadPriority,
  LeadStage,
  Prisma,
  RfqChannel,
} from "@prisma/client";
import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type { DatePreset } from "@/lib/leads/constants";

export type LeadIntakeFilter = LeadIntakeKind | "all" | "review";

export type LeadFilters = {
  q?: string;
  leadNumber?: string;
  channel?: RfqChannel | RfqChannel[];
  stage?: LeadStage | LeadStage[];
  priority?: LeadPriority | LeadPriority[];
  /** all = every intake; review = JUNK+SKIPPED; or a specific LeadIntakeKind */
  intakeKind?: LeadIntakeFilter;
  assignedToUserId?: string | "unassigned" | "me";
  category?: string;
  quotationStatus?: "none" | "any" | "sent" | "won" | "lost";
  minExpectedValue?: number;
  maxExpectedValue?: number;
  datePreset?: DatePreset;
  dateFrom?: string;
  dateTo?: string;
  slaStatus?: "pending" | "overdue" | "ok";
  mineUserId?: string;
  includeArchived?: boolean;
  hotOnly?: boolean;
  wonOnly?: boolean;
  lostOnly?: boolean;
};

function asArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export function resolveDateRange(filters: LeadFilters): { gte?: Date; lte?: Date } {
  const now = new Date();
  const preset = filters.datePreset || "all";

  switch (preset) {
    case "today":
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { gte: startOfDay(y), lte: endOfDay(y) };
    }
    case "last7":
      return { gte: startOfDay(subDays(now, 6)), lte: endOfDay(now) };
    case "last30":
      return { gte: startOfDay(subDays(now, 29)), lte: endOfDay(now) };
    case "last4months":
      return { gte: startOfDay(subMonths(now, 4)), lte: endOfDay(now) };
    case "thisMonth":
      return { gte: startOfMonth(now), lte: endOfMonth(now) };
    case "previousMonth": {
      const prev = subMonths(now, 1);
      return { gte: startOfMonth(prev), lte: endOfMonth(prev) };
    }
    case "custom": {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.dateFrom) range.gte = startOfDay(new Date(filters.dateFrom));
      if (filters.dateTo) range.lte = endOfDay(new Date(filters.dateTo));
      return range;
    }
    default:
      return {};
  }
}

export function buildLeadWhere(filters: LeadFilters): Prisma.RfqWhereInput {
  const and: Prisma.RfqWhereInput[] = [];

  if (!filters.includeArchived) {
    and.push({ archivedAt: null });
  }

  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerCompany: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { leadNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { parsedCategory: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (filters.leadNumber?.trim()) {
    and.push({
      leadNumber: { contains: filters.leadNumber.trim(), mode: "insensitive" },
    });
  }

  const channels = asArray(filters.channel);
  if (channels?.length) and.push({ channel: { in: channels } });

  if (filters.intakeKind === "review") {
    and.push({ intakeKind: { in: ["JUNK", "SKIPPED"] } });
  } else if (
    filters.intakeKind &&
    filters.intakeKind !== "all" &&
    (filters.intakeKind === "REQUIREMENT" ||
      filters.intakeKind === "JUNK" ||
      filters.intakeKind === "SKIPPED")
  ) {
    and.push({ intakeKind: filters.intakeKind });
  }

  const stages = asArray(filters.stage);
  if (stages?.length) and.push({ leadStage: { in: stages } });

  const priorities = asArray(filters.priority);
  if (priorities?.length) and.push({ priority: { in: priorities } });

  if (filters.hotOnly) {
    and.push({ priority: { in: ["HOT", "HIGH"] } });
  }
  if (filters.wonOnly) {
    and.push({ leadStage: "CLOSED_WON" });
  }
  if (filters.lostOnly) {
    and.push({ leadStage: { in: ["DEAL_LOST", "DISQUALIFIED"] } });
  }

  if (filters.assignedToUserId === "unassigned") {
    and.push({ assignedToUserId: null });
  } else if (filters.assignedToUserId === "me" && filters.mineUserId) {
    and.push({ assignedToUserId: filters.mineUserId });
  } else if (filters.assignedToUserId) {
    and.push({ assignedToUserId: filters.assignedToUserId });
  }

  if (filters.category?.trim()) {
    const cat = filters.category.trim();
    and.push({
      OR: [
        { category: { contains: cat, mode: "insensitive" } },
        { parsedCategory: { contains: cat, mode: "insensitive" } },
      ],
    });
  }

  if (filters.quotationStatus === "none") {
    and.push({ quotes: { none: {} } });
  } else if (filters.quotationStatus === "any") {
    and.push({ quotes: { some: {} } });
  } else if (filters.quotationStatus === "sent") {
    and.push({
      quotes: {
        some: {
          status: {
            in: [
              "SENT",
              "VIEWED",
              "UNDER_NEGOTIATION",
              "REVISED",
              "ACCEPTED",
              "REJECTED",
              "INVOICE_GENERATED",
              "PAYMENT_PENDING",
              "PAYMENT_RECEIVED",
              "DELIVERED",
              "CLOSED",
            ],
          },
        },
      },
    });
  } else if (filters.quotationStatus === "won") {
    and.push({
      quotes: {
        some: {
          status: {
            in: [
              "ACCEPTED",
              "INVOICE_GENERATED",
              "PAYMENT_PENDING",
              "PAYMENT_RECEIVED",
              "DELIVERED",
              "CLOSED",
            ],
          },
        },
      },
    });
  } else if (filters.quotationStatus === "lost") {
    and.push({ quotes: { some: { status: "REJECTED" } } });
  }

  if (filters.minExpectedValue != null || filters.maxExpectedValue != null) {
    and.push({
      expectedValue: {
        ...(filters.minExpectedValue != null ? { gte: filters.minExpectedValue } : {}),
        ...(filters.maxExpectedValue != null ? { lte: filters.maxExpectedValue } : {}),
      },
    });
  }

  const range = resolveDateRange(filters);
  if (range.gte || range.lte) {
    and.push({ createdAt: range });
  }

  const now = new Date();
  if (filters.slaStatus === "overdue") {
    and.push({
      slaDueAt: { lt: now },
      leadStage: {
        notIn: ["CLOSED_WON", "DISQUALIFIED", "DEAL_LOST"],
      },
    });
  } else if (filters.slaStatus === "pending") {
    and.push({
      slaDueAt: { gte: now },
      leadStage: {
        notIn: ["CLOSED_WON", "DISQUALIFIED", "DEAL_LOST"],
      },
    });
  } else if (filters.slaStatus === "ok") {
    and.push({
      OR: [
        { slaDueAt: null },
        { leadStage: { in: ["CLOSED_WON", "DISQUALIFIED", "DEAL_LOST"] } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export function parseLeadFiltersFromSearchParams(
  params: URLSearchParams,
  sessionUserId?: string
): LeadFilters {
  const multi = (key: string) => {
    const all = params.getAll(key).filter(Boolean);
    if (all.length) return all;
    const one = params.get(key);
    return one ? [one] : undefined;
  };

  const num = (key: string) => {
    const v = params.get(key);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const intakeRaw = params.get("intakeKind") || undefined;
  const intakeKind: LeadFilters["intakeKind"] =
    intakeRaw === "all" ||
    intakeRaw === "review" ||
    intakeRaw === "REQUIREMENT" ||
    intakeRaw === "JUNK" ||
    intakeRaw === "SKIPPED"
      ? intakeRaw
      : undefined;

  return {
    q: params.get("q") || undefined,
    leadNumber: params.get("leadNumber") || undefined,
    channel: multi("channel") as LeadFilters["channel"],
    stage: multi("stage") as LeadFilters["stage"],
    priority: multi("priority") as LeadFilters["priority"],
    intakeKind,
    assignedToUserId: params.get("assignedToUserId") || undefined,
    category: params.get("category") || undefined,
    quotationStatus: (params.get("quotationStatus") as LeadFilters["quotationStatus"]) || undefined,
    minExpectedValue: num("minExpectedValue"),
    maxExpectedValue: num("maxExpectedValue"),
    datePreset: (params.get("datePreset") as LeadFilters["datePreset"]) || "all",
    dateFrom: params.get("dateFrom") || undefined,
    dateTo: params.get("dateTo") || undefined,
    slaStatus: (params.get("slaStatus") as LeadFilters["slaStatus"]) || undefined,
    mineUserId: sessionUserId,
    includeArchived: params.get("includeArchived") === "1",
    hotOnly: params.get("hotOnly") === "1",
    wonOnly: params.get("wonOnly") === "1",
    lostOnly: params.get("lostOnly") === "1",
  };
}
