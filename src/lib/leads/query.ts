import type { LeadRow, LeadUser } from "@/components/leads/types";
import type { LeadIntakeFilter } from "@/lib/leads/filters";

export const LEADS_PAGE_SIZE = 50;

export type LeadsListFilters = {
  take?: number;
  skip?: number;
  intakeKind?: LeadIntakeFilter | "all" | string;
  q?: string;
  stage?: string;
  priority?: string;
  channel?: string;
  assignedToUserId?: string;
  category?: string;
  datePreset?: string;
  dateFrom?: string;
  dateTo?: string;
  slaStatus?: string;
  /** Extra preset query params (mine, hotOnly, etc.) */
  presetQuery?: string | Record<string, string>;
};

/** Browser-URL state for LeadsWorkbench (survives navigate → browser back). */
export type LeadsWorkbenchUrlState = {
  intakeKind: LeadIntakeFilter;
  q: string;
  stage: string;
  priority: string;
  channel: string;
  assignee: string;
  category: string;
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  slaStatus: string;
  page: number;
  leadId: string | null;
};

const WORKBENCH_INTAKE_VALUES = new Set<LeadIntakeFilter>([
  "all",
  "review",
  "REQUIREMENT",
  "JUNK",
  "SKIPPED",
]);

export function defaultWorkbenchIntakeKind(
  presetQuery?: Record<string, string>
): LeadIntakeFilter {
  if (
    presetQuery?.hotOnly ||
    presetQuery?.wonOnly ||
    presetQuery?.lostOnly ||
    presetQuery?.mine
  ) {
    return "REQUIREMENT";
  }
  return "all";
}

export function parseLeadsWorkbenchSearchParams(
  params: URLSearchParams,
  presetQuery?: Record<string, string>
): LeadsWorkbenchUrlState {
  const intakeRaw = params.get("intakeKind");
  const intakeKind =
    intakeRaw && WORKBENCH_INTAKE_VALUES.has(intakeRaw as LeadIntakeFilter)
      ? (intakeRaw as LeadIntakeFilter)
      : defaultWorkbenchIntakeKind(presetQuery);

  const pageRaw = Number(params.get("page") || "0");
  const page =
    Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;
  const leadId = params.get("leadId")?.trim() || null;

  return {
    intakeKind,
    q: params.get("q") || "",
    stage: params.get("stage") || "",
    priority: params.get("priority") || "",
    channel: params.get("channel") || "",
    assignee: params.get("assignedToUserId") || "",
    category: params.get("category") || "",
    datePreset: params.get("datePreset") || "all",
    dateFrom: params.get("dateFrom") || "",
    dateTo: params.get("dateTo") || "",
    slaStatus: params.get("slaStatus") || "",
    page,
    leadId,
  };
}

export function buildLeadsWorkbenchSearchParams(
  state: LeadsWorkbenchUrlState,
  presetQuery?: Record<string, string>
) {
  const params = new URLSearchParams();
  const defaultIntake = defaultWorkbenchIntakeKind(presetQuery);

  if (state.intakeKind !== defaultIntake) {
    params.set("intakeKind", state.intakeKind);
  }
  if (state.q) params.set("q", state.q);
  if (state.stage) params.set("stage", state.stage);
  if (state.priority) params.set("priority", state.priority);
  if (state.channel) params.set("channel", state.channel);
  if (state.assignee) params.set("assignedToUserId", state.assignee);
  if (state.category.trim()) params.set("category", state.category.trim());
  if (state.datePreset && state.datePreset !== "all") {
    params.set("datePreset", state.datePreset);
  }
  if (state.datePreset === "custom") {
    if (state.dateFrom) params.set("dateFrom", state.dateFrom);
    if (state.dateTo) params.set("dateTo", state.dateTo);
  }
  if (state.slaStatus) params.set("slaStatus", state.slaStatus);
  if (state.page > 0) params.set("page", String(state.page));
  if (state.leadId) params.set("leadId", state.leadId);

  return params;
}

export type LeadsListResponse = {
  items: LeadRow[];
  total: number;
  stageCounts: Record<string, number>;
  intakeKindCounts: {
    REQUIREMENT: number;
    JUNK: number;
    SKIPPED: number;
  };
};

export const leadsKeys = {
  all: ["leads"] as const,
  lists: () => [...leadsKeys.all, "list"] as const,
  list: (filters: LeadsListFilters) =>
    [...leadsKeys.lists(), filters] as const,
  details: () => [...leadsKeys.all, "detail"] as const,
  detail: (id: string, view: "drawer" | "full" = "drawer") =>
    [...leadsKeys.details(), id, view] as const,
  users: () => [...leadsKeys.all, "users"] as const,
  savedViews: () => [...leadsKeys.all, "saved-views"] as const,
};

export function buildLeadsSearchParams(filters: LeadsListFilters) {
  const params = new URLSearchParams(
    typeof filters.presetQuery === "string"
      ? filters.presetQuery
      : filters.presetQuery || {}
  );
  const take = filters.take ?? LEADS_PAGE_SIZE;
  const skip = filters.skip ?? 0;
  params.set("take", String(take));
  params.set("skip", String(skip));

  const intake = filters.intakeKind || "all";
  params.set("intakeKind", intake === "all" ? "all" : String(intake));

  if (filters.q) params.set("q", filters.q);
  else params.delete("q");
  if (filters.stage) params.set("stage", filters.stage);
  else params.delete("stage");
  if (filters.priority) params.set("priority", filters.priority);
  else params.delete("priority");
  if (filters.channel) params.set("channel", filters.channel);
  else params.delete("channel");
  if (filters.assignedToUserId)
    params.set("assignedToUserId", filters.assignedToUserId);
  else params.delete("assignedToUserId");
  if (filters.category?.trim())
    params.set("category", filters.category.trim());
  else params.delete("category");
  if (filters.datePreset && filters.datePreset !== "all")
    params.set("datePreset", filters.datePreset);
  else params.delete("datePreset");
  if (filters.datePreset === "custom") {
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  } else {
    params.delete("dateFrom");
    params.delete("dateTo");
  }
  if (filters.slaStatus) params.set("slaStatus", filters.slaStatus);
  else params.delete("slaStatus");

  return params;
}

export async function fetchLeadsList(
  filters: LeadsListFilters
): Promise<LeadsListResponse> {
  const params = buildLeadsSearchParams(filters);
  const res = await fetch(`/api/leads?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Failed to load leads"
    );
  }
  const data = await res.json();
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: typeof data.total === "number" ? data.total : 0,
    stageCounts: data.stageCounts || {},
    intakeKindCounts: {
      REQUIREMENT: data.intakeKindCounts?.REQUIREMENT ?? 0,
      JUNK: data.intakeKindCounts?.JUNK ?? 0,
      SKIPPED: data.intakeKindCounts?.SKIPPED ?? 0,
    },
  };
}

export async function fetchLeadDetail(
  id: string,
  view: "drawer" | "full" = "drawer"
) {
  const res = await fetch(
    `/api/leads/${id}${view === "drawer" ? "?view=drawer" : ""}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Failed to load lead"
    );
  }
  return res.json();
}

export async function fetchLeadUsers(): Promise<LeadUser[]> {
  const res = await fetch("/api/leads/users");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchLeadSavedViews(): Promise<
  { id: string; name: string; filters: Record<string, unknown> }[]
> {
  const res = await fetch("/api/leads/saved-views");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}
