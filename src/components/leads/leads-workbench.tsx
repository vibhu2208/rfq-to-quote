"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowUpDown,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SquareKanban,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { CaptureRequirementDrawer } from "@/components/leads/capture-requirement-drawer";
import {
  LeadDetailDrawer,
  type LeadDrawerRowPatch,
} from "@/components/leads/lead-detail-drawer";
import { LeadProcessBar } from "@/components/leads/lead-process-bar";
import { LeadsPagination } from "@/components/leads/leads-pagination";
import { LeadsTableRow } from "@/components/leads/leads-table-row";
import {
  COLUMN_CELL_CLASS,
  COLUMN_HEADER_TOOLTIPS,
  COLUMN_LABELS,
  customDateRangeError,
  quotePopoverTitle,
  fixedPopoverCoords,
  isDatePresetFilterActive,
  money,
  recentActivityItems,
  relativeTime,
  savedViewFiltersMatch,
  visibleLeadColumns,
} from "@/components/leads/leads-workbench-helpers";
import type { LeadRow } from "@/components/leads/types";
import { AppPageSkeleton } from "@/components/page-skeleton";
import {
  DateTimePicker,
  parseLocalDateTimeValue,
  toLocalDateTimeValue,
} from "@/components/ui/date-time-picker";
import { buildReminderCopy } from "@/lib/leads/reminder-copy";
import { validateFutureDateTime } from "@/lib/datetime/future-datetime";
import { useFutureDateTimeField } from "@/lib/datetime/use-future-datetime-field";
import { formatAttachmentSize } from "@/lib/quote-attachments";
import { useLeadsList } from "@/hooks/use-leads-list";
import {
  DEFAULT_LEAD_COLUMNS,
  LEAD_CHANNEL_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  PRIMARY_LEAD_CHANNELS,
  normalizeLeadColumns,
  type LeadColumnId,
} from "@/lib/leads/constants";
import type { LeadIntakeFilter } from "@/lib/leads/filters";
import {
  LEADS_PAGE_SIZE,
  buildLeadsWorkbenchSearchParams,
  decideLeadsUrlSync,
  fetchLeadSavedViews,
  fetchLeadUsers,
  leadsKeys,
  parseLeadsWorkbenchSearchParams,
  type LeadsListFilters,
  type LeadsListResponse,
  type LeadsWorkbenchUrlState,
} from "@/lib/leads/query";

type HeaderFilterCol =
  | "leadId"
  | "requirement"
  | "stage"
  | "priority"
  | "assignedTo";

const HEADER_FILTER_COLS: HeaderFilterCol[] = [
  "leadId",
  "requirement",
  "stage",
  "priority",
  "assignedTo",
];

function isHeaderFilterCol(col: LeadColumnId): col is HeaderFilterCol {
  return (HEADER_FILTER_COLS as string[]).includes(col);
}

const REMIND_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "TASK", label: "Task" },
] as const;

const CALL_OUTCOMES = [
  "Connected",
  "No Answer",
  "Busy",
  "Call Back Requested",
  "Not Reachable",
  "Switched off",
  "Invalid / Wrong Number",
  "Call Rejected",
  "DND / Do Not Call",
  "Other",
] as const;

function reminderDraftFor(row: {
  leadNumber: string;
  customerName?: string;
  customerCompany?: string;
  due: string;
  title: string;
  comment: string;
}) {
  const due =
    parseLocalDateTimeValue(row.due) ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    })();
  return buildReminderCopy({
    customerName: (row.customerName || row.customerCompany || "").trim(),
    leadNumber: row.leadNumber,
    dueAt: due,
    title: row.title,
    notes: row.comment,
  });
}

function defaultRemindDue() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return toLocalDateTimeValue(tomorrow);
}

const LEAD_DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.gif,.txt,.zip";

type Props = {
  title: string;
  presetQuery?: Record<string, string>;
};

export function LeadsWorkbench(props: Props) {
  return (
    <Suspense fallback={<AppPageSkeleton variant="table" />}>
      <LeadsWorkbenchInner {...props} />
    </Suspense>
  );
}

function LeadsWorkbenchInner({ title, presetQuery }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialUrlRef = useRef(
    parseLeadsWorkbenchSearchParams(searchParams, presetQuery)
  );
  const initialUrl = initialUrlRef.current;
  const urlSyncRef = useRef(searchParams.toString());
  const urlPendingRef = useRef<string | null>(null);
  const externalNavRef = useRef(false);
  const prevDrawerLeadIdRef = useRef(initialUrl.leadId);
  const [page, setPage] = useState(initialUrl.page);
  const tableViewActive = !pathname.startsWith("/leads/pipeline");
  const [intakeKind, setIntakeKind] = useState<LeadIntakeFilter>(
    initialUrl.intakeKind
  );
  const [q, setQ] = useState(initialUrl.q);
  const [debouncedQ, setDebouncedQ] = useState(initialUrl.q);
  const [stage, setStage] = useState(initialUrl.stage);
  const [priority, setPriority] = useState(initialUrl.priority);
  const [channel, setChannel] = useState(initialUrl.channel);
  const [assignee, setAssignee] = useState(initialUrl.assignee);
  const [category, setCategory] = useState(initialUrl.category);
  const [datePreset, setDatePreset] = useState(initialUrl.datePreset);
  const [dateFrom, setDateFrom] = useState(initialUrl.dateFrom);
  const [dateTo, setDateTo] = useState(initialUrl.dateTo);
  const [openRfq, setOpenRfq] = useState(
    () =>
      parseLeadsWorkbenchSearchParams(searchParams, presetQuery).openRfq ===
      true
  );
  const [dateRangeError, setDateRangeError] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [slaStatus, setSlaStatus] = useState(initialUrl.slaStatus);
  const [headerFilter, setHeaderFilter] = useState<{
    col: HeaderFilterCol;
    top: number;
    left: number;
  } | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(
    initialUrl.datePreset === "custom" &&
      Boolean(initialUrl.dateFrom || initialUrl.dateTo)
  );
  const [draftDateFrom, setDraftDateFrom] = useState(initialUrl.dateFrom);
  const [draftDateTo, setDraftDateTo] = useState(initialUrl.dateTo);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [creatingQuoteId, setCreatingQuoteId] = useState<string | null>(null);
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(
    initialUrl.leadId
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(
    () => new Set()
  );
  const [activityPopover, setActivityPopover] = useState<{
    rowId: string;
    top: number;
    left: number;
    items: {
      id: string;
      type: string;
      title: string;
      body?: string;
      createdAt: string;
    }[];
  } | null>(null);
  const [quotesPopover, setQuotesPopover] = useState<{
    rowId: string;
    top: number;
    left: number;
    quotes: LeadRow["quotes"];
    total: number;
  } | null>(null);
  const [remindForm, setRemindForm] = useState<{
    leadId: string;
    leadNumber: string;
    customerName: string;
    customerCompany: string;
    customerEmail: string;
    customerPhone: string;
    due: string;
    type: string;
    title: string;
    comment: string;
    notifyEmail: boolean;
    notifyWhatsapp: boolean;
    emailSubject: string;
    emailBody: string;
    whatsappBody: string;
    emailEdited: boolean;
    whatsappEdited: boolean;
    scheduledOpen: boolean;
    scheduled: {
      id: string;
      type: string;
      status: string;
      dueAt: string;
      title: string;
      notes: string;
    }[];
    scheduledLoading: boolean;
    saving: boolean;
    confirmClientSend: boolean;
  } | null>(null);
  const [actionToast, setActionToast] = useState<{
    title: string;
    detail?: string;
    tone: "success" | "warning";
  } | null>(null);
  const [callLogForm, setCallLogForm] = useState<{
    leadId: string;
    leadNumber: string;
    contactLabel: string;
    outcome: string;
    notes: string;
    followUpDue: string;
    saving: boolean;
  } | null>(null);
  const remindDueFutureError = useFutureDateTimeField(
    remindForm?.due ?? "",
    Boolean(remindForm)
  );
  const callFollowFutureError = useFutureDateTimeField(
    callLogForm?.followUpDue ?? "",
    Boolean(callLogForm)
  );
  const [callOutcomeOpen, setCallOutcomeOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState<{
    leadId: string;
    leadNumber: string;
    contactLabel: string;
    note: string;
    file: File | null;
    saving: boolean;
    loadingDocs: boolean;
    docs: {
      id: string;
      fileName: string;
      size: number;
      note: string;
      createdAt: string;
    }[];
  } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const activityLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const listFiltersRef = useRef<LeadsListFilters | null>(null);
  // Defaults only on first paint — localStorage is applied after mount to avoid hydration mismatch.
  const [columns, setColumns] = useState<LeadColumnId[]>([
    ...DEFAULT_LEAD_COLUMNS,
  ]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  const skipFilterPageReset = useRef(true);
  useEffect(() => {
    // Preserve page restored from the URL on the first paint.
    if (skipFilterPageReset.current) {
      skipFilterPageReset.current = false;
      return;
    }
    setPage(0);
  }, [
    debouncedQ,
    stage,
    priority,
    channel,
    assignee,
    category,
    datePreset,
    dateFrom,
    dateTo,
    slaStatus,
    intakeKind,
    presetQuery,
  ]);

  function applyUrlState(parsed: LeadsWorkbenchUrlState) {
    skipFilterPageReset.current = true;
    setIntakeKind(parsed.intakeKind);
    setQ(parsed.q);
    setDebouncedQ(parsed.q);
    setStage(parsed.stage);
    setPriority(parsed.priority);
    setChannel(parsed.channel);
    setAssignee(parsed.assignee);
    setCategory(parsed.category);
    setDatePreset(parsed.datePreset);
    setDateFrom(parsed.dateFrom);
    setDateTo(parsed.dateTo);
    setDraftDateFrom(parsed.dateFrom);
    setDraftDateTo(parsed.dateTo);
    setSlaStatus(parsed.slaStatus);
    setPage(parsed.page);
    setOpenRfq(Boolean(parsed.openRfq));
    setDrawerLeadId(parsed.leadId);
    prevDrawerLeadIdRef.current = parsed.leadId;
    setSelectedViewId("");
  }

  // Keep list filters / intake tab / open drawer in the URL so browser back
  // from /rfq/[id] remounts the same sub-view instead of the default list.
  // Opening a drawer uses push so Back closes it; filter tweaks use replace.
  // Search text is written from the debounced value so a keystroke cannot be
  // dropped when an older router.replace lands late.
  useEffect(() => {
    function onPop() {
      externalNavRef.current = true;
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const current = searchParams.toString();
    if (externalNavRef.current) {
      externalNavRef.current = false;
      urlPendingRef.current = null;
      applyUrlState(parseLeadsWorkbenchSearchParams(searchParams, presetQuery));
      urlSyncRef.current = current;
      return;
    }

    const desired = buildLeadsWorkbenchSearchParams(
      {
        intakeKind,
        q: debouncedQ,
        stage,
        priority,
        channel,
        assignee,
        category,
        datePreset,
        dateFrom,
        dateTo,
        slaStatus,
        page,
        leadId: drawerLeadId,
        openRfq,
      },
      presetQuery
    ).toString();

    const decision = decideLeadsUrlSync({
      currentSearch: current,
      desiredSearch: desired,
      lastWrittenSearch: urlSyncRef.current,
      pendingSearch: urlPendingRef.current,
    });

    if (decision.type === "idle") {
      urlPendingRef.current = null;
      urlSyncRef.current = desired;
      prevDrawerLeadIdRef.current = drawerLeadId;
      return;
    }
    if (decision.type === "apply-external") {
      urlPendingRef.current = null;
      applyUrlState(parseLeadsWorkbenchSearchParams(searchParams, presetQuery));
      urlSyncRef.current = current;
      return;
    }

    const openingDrawer =
      Boolean(drawerLeadId) && !prevDrawerLeadIdRef.current;
    prevDrawerLeadIdRef.current = drawerLeadId;
    urlSyncRef.current = desired;
    urlPendingRef.current = desired;
    const href = desired ? `${pathname}?${desired}` : pathname;
    if (openingDrawer) {
      router.push(href, { scroll: false });
    } else {
      router.replace(href, { scroll: false });
    }
  }, [
    intakeKind,
    debouncedQ,
    stage,
    priority,
    channel,
    assignee,
    category,
    datePreset,
    dateFrom,
    dateTo,
    slaStatus,
    page,
    drawerLeadId,
    openRfq,
    pathname,
    presetQuery,
    router,
    searchParams,
  ]);

  const appliedRangeError =
    datePreset === "custom" ? customDateRangeError(dateFrom, dateTo) : null;

  const listFilters = useMemo<LeadsListFilters>(
    () => ({
      take: LEADS_PAGE_SIZE,
      skip: page * LEADS_PAGE_SIZE,
      intakeKind,
      q: debouncedQ,
      stage,
      priority,
      channel,
      assignedToUserId: assignee,
      category,
      datePreset: appliedRangeError ? "all" : datePreset,
      dateFrom: appliedRangeError ? "" : dateFrom,
      dateTo: appliedRangeError ? "" : dateTo,
      slaStatus,
      openRfq,
      presetQuery,
    }),
    [
      page,
      intakeKind,
      debouncedQ,
      stage,
      priority,
      channel,
      assignee,
      category,
      datePreset,
      dateFrom,
      dateTo,
      appliedRangeError,
      slaStatus,
      openRfq,
      presetQuery,
    ]
  );
  listFiltersRef.current = listFilters;

  const {
    data: listData,
    isLoading,
    isFetching,
    refetch,
  } = useLeadsList(listFilters);

  const rows = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const stageCounts = listData?.stageCounts ?? {};
  const loading = isLoading && rows.length === 0;
  const countsPending = isLoading && !listData;

  const { data: users = [] } = useQuery({
    queryKey: leadsKeys.users(),
    queryFn: fetchLeadUsers,
    staleTime: 5 * 60_000,
  });

  const { data: savedViews = [], refetch: refetchSavedViews } = useQuery({
    queryKey: leadsKeys.savedViews(),
    queryFn: fetchLeadSavedViews,
    staleTime: 60_000,
  });

  const updateListCache = useCallback(
    (updater: (prev: LeadsListResponse) => LeadsListResponse) => {
      const key = listFiltersRef.current;
      if (!key) return;
      queryClient.setQueryData<LeadsListResponse>(leadsKeys.list(key), (old) => {
        if (!old) return old;
        return updater(old);
      });
    },
    [queryClient]
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<LeadRow>) => {
      updateListCache((old) => ({
        ...old,
        items: old.items.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));
    },
    [updateListCache]
  );

  const prependActivity = useCallback(
    (
      id: string,
      activity: LeadRow["activities"][number],
      extras?: Partial<LeadRow>
    ) => {
      updateListCache((old) => ({
        ...old,
        items: old.items.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            ...extras,
            activities: [activity, ...(r.activities || [])].slice(0, 5),
          };
        }),
      }));
    },
    [updateListCache]
  );

  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
    await refetch();
  }, [queryClient, refetch]);

  async function pollInbox() {
    setPolling(true);
    setActionToast({
      title: "Checking inbox…",
      detail: "Outlook + WhatsApp",
      tone: "success",
    });
    try {
      const res = await fetch("/api/cron/inbox-poll", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionToast({
          title: "Inbox poll failed",
          detail:
            typeof data.error === "string" ? data.error : undefined,
          tone: "warning",
        });
        return;
      }
      const email = data.email && typeof data.email === "object" ? data.email : data;
      const whatsapp =
        data.whatsapp && typeof data.whatsapp === "object" ? data.whatsapp : null;
      const parts: string[] = [];
      if (email?.initialized) {
        parts.push("Outlook checkpoint set — only newer mail will import");
      } else if (email?.error) {
        parts.push(`Outlook · ${email.error}`);
      } else {
        parts.push(
          `Outlook · fetched ${email?.fetched ?? data.fetched ?? 0} · leads ${email?.created ?? 0} · skipped ${email?.skipped ?? data.skipped ?? 0}`
        );
      }
      if (whatsapp) {
        if (whatsapp.created > 0) {
          parts.push(
            `WhatsApp · leads ${whatsapp.created} · skipped ${whatsapp.skipped ?? 0}`
          );
        } else {
          parts.push(
            whatsapp.available
              ? "WhatsApp · no new webhook messages — use Add WhatsApp if a chat was missed"
              : "WhatsApp · not configured"
          );
        }
      }
      setActionToast({
        title: "Inbox updated",
        detail: parts.join(" · "),
        tone: "success",
      });
      await load();
    } finally {
      setPolling(false);
    }
  }

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("quoteflow.leadColumns.v3") ||
        localStorage.getItem("quoteflow.leadColumns");
      if (raw) setColumns(normalizeLeadColumns(JSON.parse(raw)));
    } catch {
      /* keep defaults */
    }
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    localStorage.setItem("quoteflow.leadColumns.v3", JSON.stringify(columns));
  }, [columns, prefsReady]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(
    action: "assign" | "stage" | "priority" | "archive",
    extra: Record<string, unknown> = {}
  ) {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action, ...extra }),
      });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function changeRowStage(id: string, toStage: string, current: string) {
    if (!toStage || toStage === current) return;
    const needsReason = toStage === "DISQUALIFIED" || toStage === "DEAL_LOST";
    const reason = needsReason
      ? window.prompt(
          toStage === "DISQUALIFIED"
            ? "Disqualification reason (required):"
            : "Deal lost reason (required):"
        ) || ""
      : "";
    if (needsReason && !reason.trim()) return;

    patchRow(id, { leadStage: toStage });

    const res = await fetch(`/api/leads/${id}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage, reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(
        typeof data.error === "string" ? data.error : "Stage update failed"
      );
      await load();
      return;
    }
  }

  async function changeRowPriority(
    id: string,
    nextPriority: string,
    current: string
  ) {
    if (!nextPriority || nextPriority === current) return;
    patchRow(id, { priority: nextPriority });
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: nextPriority }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(
        typeof data.error === "string" ? data.error : "Priority update failed"
      );
      await load();
      return;
    }
  }

  async function promoteRow(id: string) {
    setPromotingId(id);
    try {
      const res = await fetch(`/api/leads/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(
          typeof data.error === "string" ? data.error : "Promote failed"
        );
        return;
      }
      setActionToast({
        title: "Promoted to requirement lead",
        tone: "success",
      });
      patchRow(id, { intakeKind: "REQUIREMENT" });
    } finally {
      setPromotingId(null);
    }
  }

  async function createQuoteFromLead(id: string) {
    setCreatingQuoteId(id);
    try {
      const res = await fetch(`/api/rfqs/${id}/convert-quote`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        window.alert(
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Could not create quote"
        );
        return;
      }
      setActionToast({
        title: "Draft quote created from matching",
        tone: "success",
      });
      // Do not clear drawerLeadId before push — URL sync would
      // router.replace(/leads) and race away from the quote page.
      router.push(`/quotes/${data.id}`);
    } catch (err) {
      window.alert(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not create quote"
      );
    } finally {
      setCreatingQuoteId(null);
    }
  }

  function openRemind(row: LeadRow) {
    const email = (row.customerEmail || "").trim();
    const phone = (row.customerPhone || "").trim();
    const due = defaultRemindDue();
    const title = `Follow up · ${row.leadNumber}`;
    const draft = reminderDraftFor({
      leadNumber: row.leadNumber,
      customerName: row.customerName,
      customerCompany: row.customerCompany,
      due,
      title,
      comment: "",
    });
    setRemindForm({
      leadId: row.id,
      leadNumber: row.leadNumber,
      customerName: (row.customerName || "").trim(),
      customerCompany: (row.customerCompany || "").trim(),
      customerEmail: email,
      customerPhone: phone,
      due,
      type: "CALL",
      title,
      comment: "",
      notifyEmail: false,
      notifyWhatsapp: false,
      emailSubject: draft.subject,
      emailBody: draft.text,
      whatsappBody: draft.text,
      emailEdited: false,
      whatsappEdited: false,
      scheduledOpen: false,
      scheduled: [],
      scheduledLoading: true,
      saving: false,
      confirmClientSend: false,
    });
    void (async () => {
      try {
        const res = await fetch(`/api/leads/${row.id}/follow-ups`);
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data.items) ? data.items : [];
        const scheduled = items
          .filter(
            (item: { status?: string }) =>
              item.status === "PENDING" || item.status === "OVERDUE"
          )
          .map(
            (item: {
              id: string;
              type?: string;
              status?: string;
              dueAt?: string;
              title?: string;
              notes?: string;
            }) => ({
              id: item.id,
              type: item.type || "TASK",
              status: item.status || "PENDING",
              dueAt: item.dueAt || "",
              title: item.title || "",
              notes: item.notes || "",
            })
          );
        setRemindForm((prev) =>
          prev && prev.leadId === row.id
            ? {
                ...prev,
                scheduled,
                scheduledLoading: false,
                scheduledOpen: scheduled.length > 0,
              }
            : prev
        );
      } catch {
        setRemindForm((prev) =>
          prev && prev.leadId === row.id
            ? { ...prev, scheduledLoading: false }
            : prev
        );
      }
    })();
  }

  function patchRemindForm(
    patch:
      | Partial<NonNullable<typeof remindForm>>
      | ((
          prev: NonNullable<typeof remindForm>
        ) => Partial<NonNullable<typeof remindForm>>)
  ) {
    setRemindForm((prev) => {
      if (!prev) return prev;
      const nextPatch = typeof patch === "function" ? patch(prev) : patch;
      const merged = { ...prev, ...nextPatch };
      if (!merged.emailEdited || !merged.whatsappEdited) {
        const draft = reminderDraftFor({
          leadNumber: merged.leadNumber,
          customerName: merged.customerName,
          customerCompany: merged.customerCompany,
          due: merged.due,
          title: merged.title,
          comment: merged.comment,
        });
        if (!merged.emailEdited) {
          merged.emailSubject = draft.subject;
          merged.emailBody = draft.text;
        }
        if (!merged.whatsappEdited) {
          merged.whatsappBody = draft.text;
        }
      }
      return merged;
    });
  }

  function openLogCall(row: LeadRow) {
    setCallOutcomeOpen(false);
    setCallLogForm({
      leadId: row.id,
      leadNumber: row.leadNumber,
      contactLabel:
        row.customerCompany ||
        row.customerName ||
        row.leadNumber,
      outcome: "Connected",
      notes: "",
      followUpDue: "",
      saving: false,
    });
  }

  async function submitLogCall() {
    if (!callLogForm) return;
    if (!callLogForm.outcome.trim()) {
      window.alert("Select a call outcome");
      return;
    }
    setCallLogForm((prev) => (prev ? { ...prev, saving: true } : prev));

    const bodyParts = [
      `Outcome: ${callLogForm.outcome}`,
      callLogForm.notes.trim() ? callLogForm.notes.trim() : "",
    ].filter(Boolean);

    const activityRes = await fetch(
      `/api/leads/${callLogForm.leadId}/activities`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CALL",
          title: `Call · ${callLogForm.outcome}`,
          body: bodyParts.join("\n"),
        }),
      }
    );
    if (!activityRes.ok) {
      const data = await activityRes.json().catch(() => ({}));
      setCallLogForm((prev) => (prev ? { ...prev, saving: false } : prev));
      window.alert(
        typeof data.error === "string" ? data.error : "Could not log call"
      );
      return;
    }

    if (callLogForm.followUpDue) {
      const due =
        parseLocalDateTimeValue(callLogForm.followUpDue) ??
        new Date(callLogForm.followUpDue);
      const futureErr = Number.isNaN(due.getTime())
        ? "Pick a valid date and time"
        : validateFutureDateTime(due);
      if (futureErr) {
        setCallLogForm((prev) => (prev ? { ...prev, saving: false } : prev));
        window.alert(futureErr);
        return;
      }
      if (!Number.isNaN(due.getTime())) {
        const followRes = await fetch(
          `/api/leads/${callLogForm.leadId}/follow-ups`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "CALL",
              dueAt: due.toISOString(),
              title: `Follow-up after call · ${callLogForm.outcome}`,
              notes: callLogForm.notes.trim() || undefined,
            }),
          }
        );
        if (!followRes.ok) {
          const data = await followRes.json().catch(() => ({}));
          setCallLogForm((prev) => (prev ? { ...prev, saving: false } : prev));
          window.alert(
            typeof data.error === "string"
              ? data.error
              : "Call logged, but follow-up failed"
          );
          prependActivity(callLogForm.leadId, {
            id: `local-call-${Date.now()}`,
            type: "CALL",
            title: `Call · ${callLogForm.outcome}`,
            body: bodyParts.join("\n"),
            createdAt: new Date().toISOString(),
          });
          return;
        }
        prependActivity(
          callLogForm.leadId,
          {
            id: `local-call-${Date.now()}`,
            type: "CALL",
            title: `Call · ${callLogForm.outcome}`,
            body: bodyParts.join("\n"),
            createdAt: new Date().toISOString(),
          },
          { nextFollowUpAt: due.toISOString() }
        );
        setCallLogForm(null);
        setActionToast({
          title: `Call logged · ${callLogForm.outcome}`,
          tone: "success",
        });
        return;
      }
    }

    prependActivity(callLogForm.leadId, {
      id: `local-call-${Date.now()}`,
      type: "CALL",
      title: `Call · ${callLogForm.outcome}`,
      body: bodyParts.join("\n"),
      createdAt: new Date().toISOString(),
    });
    setCallLogForm(null);
    setActionToast({
      title: `Call logged · ${callLogForm.outcome}`,
      tone: "success",
    });
  }

  async function submitRemind() {
    if (!remindForm) return;
    const due =
      parseLocalDateTimeValue(remindForm.due) ?? new Date(remindForm.due);
    if (Number.isNaN(due.getTime())) {
      window.alert("Pick a valid date and time");
      return;
    }
    const futureErr = validateFutureDateTime(due);
    if (futureErr) {
      window.alert(futureErr);
      return;
    }
    const notifyEmail =
      remindForm.notifyEmail && Boolean(remindForm.customerEmail);
    const notifyWhatsapp =
      remindForm.notifyWhatsapp && Boolean(remindForm.customerPhone);
    if (
      (notifyEmail || notifyWhatsapp) &&
      !remindForm.confirmClientSend
    ) {
      patchRemindForm({ confirmClientSend: true });
      return;
    }
    setRemindForm((prev) => (prev ? { ...prev, saving: true } : prev));
    const res = await fetch(`/api/leads/${remindForm.leadId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: remindForm.type,
        dueAt: due.toISOString(),
        title: remindForm.title.trim() || "Reminder",
        notes: remindForm.comment.trim() || undefined,
        notifyEmail,
        notifyWhatsapp,
        emailSubject: remindForm.emailSubject.trim() || undefined,
        emailBody: remindForm.emailBody.trim() || undefined,
        whatsappBody: remindForm.whatsappBody.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRemindForm((prev) => (prev ? { ...prev, saving: false } : prev));
      window.alert(
        typeof data.error === "string" ? data.error : "Could not set reminder"
      );
      return;
    }
    const current = rows.find((r) => r.id === remindForm.leadId);
    patchRow(remindForm.leadId, {
      nextFollowUpAt: due.toISOString(),
      _count: {
        ...(current?._count || {
          quotes: 0,
          messages: 0,
          followUps: 0,
          attachments: 0,
        }),
        followUps: (current?._count?.followUps || 0) + 1,
      },
    });
    const notifications =
      data && typeof data === "object" && data.notifications
        ? (data.notifications as {
            email?: { sent: boolean; to?: string; error?: string };
            whatsapp?: { sent: boolean; to?: string; error?: string };
          })
        : {};
    const leadNumber = remindForm.leadNumber;
    setRemindForm(null);

    const details: string[] = [];
    let tone: "success" | "warning" = "success";
    if (notifications.email) {
      if (notifications.email.sent) {
        details.push(
          `Email sent to ${notifications.email.to || "the client"}`
        );
      } else {
        tone = "warning";
        details.push(
          notifications.email.error || "Email could not be sent"
        );
      }
    }
    if (notifications.whatsapp) {
      if (notifications.whatsapp.sent) {
        details.push(
          `WhatsApp sent to ${notifications.whatsapp.to || "the client"}`
        );
      } else {
        tone = "warning";
        details.push(
          notifications.whatsapp.error || "WhatsApp could not be sent"
        );
      }
    }

    setActionToast({
      title: `Reminder set for ${leadNumber}`,
      detail: details.length ? details.join(" · ") : undefined,
      tone,
    });
  }

  function setRemindPreset(kind: "1h" | "tomorrow" | "3d" | "week") {
    const d = new Date();
    if (kind === "1h") {
      d.setMinutes(d.getMinutes() + 60);
      d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
    }
    if (kind === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    }
    if (kind === "3d") {
      d.setDate(d.getDate() + 3);
      d.setHours(10, 0, 0, 0);
    }
    if (kind === "week") {
      d.setDate(d.getDate() + 7);
      d.setHours(10, 0, 0, 0);
    }
    patchRemindForm({ due: toLocalDateTimeValue(d) });
  }

  async function loadLeadDocuments(leadId: string) {
    const res = await fetch(`/api/leads/${leadId}/documents`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Could not load documents"
      );
    }
    const docs = Array.isArray(data.documents)
      ? (data.documents as {
          id: string;
          fileName: string;
          size: number;
          note: string;
          createdAt: string;
        }[])
      : [];
    return docs;
  }

  function openUploadDoc(row: LeadRow) {
    setUploadForm({
      leadId: row.id,
      leadNumber: row.leadNumber,
      contactLabel:
        row.customerCompany || row.customerName || row.leadNumber,
      note: "",
      file: null,
      saving: false,
      loadingDocs: true,
      docs: [],
    });
    void loadLeadDocuments(row.id)
      .then((docs) => {
        setUploadForm((prev) =>
          prev && prev.leadId === row.id
            ? { ...prev, docs, loadingDocs: false }
            : prev
        );
        const current = rows.find((r) => r.id === row.id);
        patchRow(row.id, {
          _count: {
            ...(current?._count || {
              quotes: 0,
              messages: 0,
              followUps: 0,
              attachments: 0,
            }),
            attachments: docs.length,
          },
        });
      })
      .catch(() => {
        setUploadForm((prev) =>
          prev && prev.leadId === row.id
            ? { ...prev, loadingDocs: false }
            : prev
        );
      });
  }

  async function submitUploadDoc() {
    if (!uploadForm) return;
    if (!uploadForm.file) {
      window.alert("Choose a document to upload");
      return;
    }
    setUploadForm((prev) => (prev ? { ...prev, saving: true } : prev));
    const body = new FormData();
    body.append("file", uploadForm.file);
    if (uploadForm.note.trim()) body.append("note", uploadForm.note.trim());

    const res = await fetch(`/api/leads/${uploadForm.leadId}/documents`, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUploadForm((prev) => (prev ? { ...prev, saving: false } : prev));
      window.alert(
        typeof data.error === "string" ? data.error : "Could not upload document"
      );
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      fileName?: string;
      size?: number;
      note?: string;
      createdAt?: string;
    };
    const fileName = data.fileName || uploadForm.file.name;
    const nextDoc = {
      id: data.id || `local-${Date.now()}`,
      fileName,
      size: typeof data.size === "number" ? data.size : uploadForm.file.size,
      note: data.note || uploadForm.note.trim(),
      createdAt: data.createdAt || new Date().toISOString(),
    };
    const nextDocs = [nextDoc, ...uploadForm.docs];
    prependActivity(uploadForm.leadId, {
      id: `local-doc-${Date.now()}`,
      type: "NOTE",
      title: `Document uploaded · ${fileName}`,
      body: uploadForm.note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    const current = rows.find((r) => r.id === uploadForm.leadId);
    patchRow(uploadForm.leadId, {
      _count: {
        ...(current?._count || {
          quotes: 0,
          messages: 0,
          followUps: 0,
          attachments: 0,
        }),
        attachments: nextDocs.length,
      },
    });
    setUploadForm((prev) =>
      prev
        ? {
            ...prev,
            file: null,
            note: "",
            saving: false,
            docs: nextDocs,
            loadingDocs: false,
          }
        : prev
    );
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    setActionToast({
      title: `Document uploaded · ${fileName}`,
      tone: "success",
    });
  }

  async function deleteLeadDocument(docId: string) {
    if (!uploadForm) return;
    const res = await fetch(
      `/api/leads/${uploadForm.leadId}/documents/${docId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(
        typeof data.error === "string" ? data.error : "Could not delete document"
      );
      return;
    }
    const nextDocs = uploadForm.docs.filter((d) => d.id !== docId);
    const current = rows.find((r) => r.id === uploadForm.leadId);
    patchRow(uploadForm.leadId, {
      _count: {
        ...(current?._count || {
          quotes: 0,
          messages: 0,
          followUps: 0,
          attachments: 0,
        }),
        attachments: nextDocs.length,
      },
    });
    setUploadForm((prev) => (prev ? { ...prev, docs: nextDocs } : prev));
  }

  function applyDrawerPatch(patch?: LeadDrawerRowPatch) {
    if (!drawerLeadId || !patch) return;
    const rowPatch: Partial<LeadRow> = {};
    if (patch.leadStage !== undefined) rowPatch.leadStage = patch.leadStage;
    if (patch.priority !== undefined) rowPatch.priority = patch.priority;
    if (patch.intakeKind !== undefined) rowPatch.intakeKind = patch.intakeKind;
    if (patch.assignedTo !== undefined) rowPatch.assignedTo = patch.assignedTo;
    if (patch.nextFollowUpAt !== undefined)
      rowPatch.nextFollowUpAt = patch.nextFollowUpAt;
    if (patch.customerName !== undefined)
      rowPatch.customerName = patch.customerName;
    if (patch.customerCompany !== undefined)
      rowPatch.customerCompany = patch.customerCompany;
    if (patch.customerEmail !== undefined)
      rowPatch.customerEmail = patch.customerEmail;
    if (patch.customerPhone !== undefined)
      rowPatch.customerPhone = patch.customerPhone;
    if (patch.subject !== undefined) rowPatch.subject = patch.subject;
    if (patch.rawText !== undefined)
      rowPatch.rawText = patch.rawText.slice(0, 160);
    if (patch.category !== undefined) rowPatch.category = patch.category;
    if (patch.expectedValue !== undefined)
      rowPatch.expectedValue = patch.expectedValue;
    if (Object.keys(rowPatch).length) patchRow(drawerLeadId, rowPatch);
  }

  function scheduleActivityClose(rowId: string) {
    if (activityLeaveTimer.current) clearTimeout(activityLeaveTimer.current);
    activityLeaveTimer.current = setTimeout(() => {
      setActivityPopover((prev) => (prev?.rowId === rowId ? null : prev));
    }, 160);
  }

  function cancelActivityClose() {
    if (activityLeaveTimer.current) {
      clearTimeout(activityLeaveTimer.current);
      activityLeaveTimer.current = null;
    }
  }

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const value = (row.category || row.parsedCategory || "").trim();
      if (value) set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (!remindForm && !callLogForm && !uploadForm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (callOutcomeOpen) {
        setCallOutcomeOpen(false);
        return;
      }
      setRemindForm(null);
      setCallLogForm(null);
      setUploadForm(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remindForm, callLogForm, uploadForm, callOutcomeOpen]);

  useEffect(() => {
    if (!actionToast) return;
    const timer = window.setTimeout(() => setActionToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [actionToast]);

  useEffect(() => {
    if (!quotesPopover && !headerFilter && !showImportExport && !showCustomRange)
      return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setQuotesPopover(null);
        setHeaderFilter(null);
        setShowImportExport(false);
        setShowCustomRange(false);
      }
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        quotesPopover &&
        !target.closest("[data-quotes-popover]") &&
        !target.closest("[data-quotes-trigger]")
      ) {
        setQuotesPopover(null);
      }
      if (
        headerFilter &&
        !target.closest("[data-header-filter]") &&
        !target.closest("[data-header-filter-panel]")
      ) {
        setHeaderFilter(null);
      }
      if (showImportExport && !target.closest("[data-import-export]")) {
        setShowImportExport(false);
      }
      if (showCustomRange && !target.closest("[data-custom-range]")) {
        setShowCustomRange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [quotesPopover, headerFilter, showImportExport, showCustomRange]);

  async function saveCurrentView() {
    if (!saveViewName.trim()) return;
    await fetch("/api/leads/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: saveViewName.trim(),
        filters: {
          q,
          stage,
          priority,
          channel,
          assignee,
          category,
          datePreset,
          dateFrom,
          dateTo,
          slaStatus,
        },
        columns,
      }),
    });
    setSaveViewName("");
    await refetchSavedViews();
  }

  function applySavedView(view: {
    id: string;
    filters: Record<string, unknown>;
    columns?: unknown;
  }) {
    setSelectedViewId(view.id);
    if (Array.isArray(view.columns) && view.columns.length) {
      setColumns(normalizeLeadColumns(view.columns));
    }
    const f = view.filters || {};
    setQ(String(f.q || ""));
    setStage(String(f.stage || ""));
    setPriority(String(f.priority || ""));
    setChannel(String(f.channel || ""));
    setAssignee(String(f.assignee || ""));
    setCategory(String(f.category || ""));
    setDatePreset(String(f.datePreset || "all"));
    const nextFrom = String(f.dateFrom || "");
    const nextTo = String(f.dateTo || "");
    setDateFrom(nextFrom);
    setDateTo(nextTo);
    setDraftDateFrom(nextFrom);
    setDraftDateTo(nextTo);
    setShowCustomRange(false);
    setSlaStatus(String(f.slaStatus || ""));
  }

  function openHeaderFilter(col: HeaderFilterCol, anchor: HTMLElement) {
    if (headerFilter?.col === col) {
      setHeaderFilter(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = 228;
    const estimatedHeight = 280;
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight
        ? Math.max(8, rect.top - estimatedHeight - 4)
        : Math.min(rect.bottom + 4, window.innerHeight - estimatedHeight - 8);
    setHeaderFilter({ col, top, left });
  }

  function clearHeaderFilter(col: HeaderFilterCol) {
    if (col === "leadId") setChannel("");
    if (col === "requirement") setCategory("");
    if (col === "stage") setStage("");
    if (col === "priority") setPriority("");
    if (col === "assignedTo") setAssignee("");
    setHeaderFilter(null);
  }

  function headerFilterActive(col: HeaderFilterCol) {
    if (col === "leadId") return Boolean(channel);
    if (col === "requirement") return Boolean(category.trim());
    if (col === "stage") return Boolean(stage);
    if (col === "priority") return Boolean(priority);
    if (col === "assignedTo") return Boolean(assignee);
    return false;
  }

  function filterOptionClass(active: boolean) {
    return `block w-full rounded-md px-2 py-1.5 text-left text-xs ${
      active
        ? "bg-mid-green/15 font-medium text-dark-primary"
        : "text-dark-primary hover:bg-dark-secondary/[0.06]"
    }`;
  }

  function buildExportHref() {
    const params = new URLSearchParams(presetQuery || {});
    if (intakeKind && intakeKind !== "all") params.set("intakeKind", intakeKind);
    else params.set("intakeKind", "all");
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (priority) params.set("priority", priority);
    if (channel) params.set("channel", channel);
    if (assignee) params.set("assignedToUserId", assignee);
    if (category.trim()) params.set("category", category.trim());
    if (datePreset && datePreset !== "all") params.set("datePreset", datePreset);
    if (datePreset === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (slaStatus) params.set("slaStatus", slaStatus);
    if (openRfq) params.set("openRfq", "1");
    return `/api/leads/export?${params.toString()}`;
  }

  const activeColumnFilterCount = [
    channel,
    category.trim(),
    stage,
    priority,
    assignee,
    isDatePresetFilterActive(datePreset, dateFrom, dateTo) ? datePreset : "",
    slaStatus,
  ].filter(Boolean).length;

  function clearAllColumnFilters() {
    setChannel("");
    setCategory("");
    setStage("");
    setPriority("");
    setAssignee("");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDateRangeError("");
    setSlaStatus("");
    setOpenRfq(false);
    setShowCustomRange(false);
    setHeaderFilter(null);
    setSelectedViewId("");
  }

  function applyCustomDateRange() {
    const from = draftDateFrom.trim();
    const to = draftDateTo.trim();
    const error = customDateRangeError(from, to);
    if (error) {
      setDateRangeError(error);
      return;
    }
    setDateRangeError("");
    if (from || to) {
      setDateFrom(from);
      setDateTo(to);
      setDatePreset("custom");
    } else {
      setDateFrom("");
      setDateTo("");
      if (datePreset === "custom") setDatePreset("all");
    }
    setShowCustomRange(false);
  }

  const toolbarDatePresets = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "last7", label: "7 days" },
    { value: "last30", label: "30 days" },
    { value: "last4months", label: "4 months" },
    { value: "custom", label: "Custom range" },
  ] as const;

  const visibleColumns = useMemo(
    () => visibleLeadColumns(columns),
    [columns]
  );

  const allStageTotal = useMemo(
    () => Object.values(stageCounts).reduce((a, b) => a + b, 0),
    [stageCounts]
  );

  const selectedView = savedViews.find((v) => v.id === selectedViewId) || null;
  const viewModified = selectedView
    ? !savedViewFiltersMatch(selectedView.filters || {}, {
        q,
        stage,
        priority,
        channel,
        assignee,
        category,
        datePreset,
        dateFrom,
        dateTo,
        slaStatus,
      })
    : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-dark-primary sm:text-[1.75rem]">
            {title}
          </h1>
          <span className="hidden shrink-0 text-sm tabular-nums text-mid-green sm:inline">
            {loading
              ? "…"
              : `${total} ${
                  intakeKind === "JUNK" || intakeKind === "SKIPPED"
                    ? "item"
                    : "lead"
                }${total === 1 ? "" : "s"}`}
          </span>
        </div>

        <div
          className="inline-flex items-center rounded-xl border border-dark-primary/10 bg-white p-0.5"
          role="group"
          aria-label="View mode"
        >
          <Link
            href="/leads"
            title="Table view"
            aria-label="Table view"
            aria-current={tableViewActive ? "page" : undefined}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-[0.625rem] transition ${
              tableViewActive
                ? "bg-dark-primary text-background"
                : "text-mid-green hover:bg-dark-secondary/8 hover:text-dark-primary"
            }`}
          >
            <Table2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          <Link
            href="/leads/pipeline"
            title="Pipeline view"
            aria-label="Pipeline view"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[0.625rem] text-mid-green transition hover:bg-dark-secondary/8 hover:text-dark-primary"
          >
            <SquareKanban className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>

        <div
          className="relative inline-flex flex-wrap items-center rounded-full border border-dark-primary/10 bg-white p-0.5 text-xs sm:text-[13px]"
          data-custom-range=""
        >
          {toolbarDatePresets.map((preset, idx) => {
            const customApplied = isDatePresetFilterActive(
              "custom",
              dateFrom,
              dateTo
            );
            const active =
              preset.value === "custom"
                ? customApplied || showCustomRange
                : datePreset === preset.value &&
                  isDatePresetFilterActive(datePreset, dateFrom, dateTo);
            const allActive =
              preset.value === "all" &&
              !isDatePresetFilterActive(datePreset, dateFrom, dateTo) &&
              !showCustomRange;
            const selected = preset.value === "all" ? allActive : active;
            return (
              <div key={preset.value} className="flex items-center">
                {idx > 0 ? (
                  <span className="px-0.5 text-dark-primary/25" aria-hidden>
                    |
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (preset.value === "custom") {
                      setDraftDateFrom(dateFrom);
                      setDraftDateTo(dateTo);
                      setShowCustomRange((v) => !v);
                      return;
                    }
                    setDatePreset(preset.value);
                    setShowCustomRange(false);
                  }}
                  className={`rounded-full px-2.5 py-1.5 font-medium transition ${
                    selected
                      ? "bg-dark-secondary/[0.08] text-dark-primary"
                      : "text-mid-green hover:text-dark-primary"
                  }`}
                >
                  {preset.label}
                </button>
              </div>
            );
          })}
          {showCustomRange ? (
            <div className="absolute left-0 top-full z-40 mt-2 flex w-[17rem] flex-col gap-2 rounded-xl border border-dark-primary/10 bg-white p-3 shadow-[0_12px_28px_rgba(11,43,38,0.14)]">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-mid-green">From</span>
                <input
                  type="date"
                  value={draftDateFrom}
                  onChange={(e) => {
                    setDraftDateFrom(e.target.value);
                    setDateRangeError("");
                  }}
                  className="h-8 w-full rounded-lg bg-dark-secondary/[0.05] px-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-mid-green">To</span>
                <input
                  type="date"
                  value={draftDateTo}
                  onChange={(e) => {
                    setDraftDateTo(e.target.value);
                    setDateRangeError("");
                  }}
                  className="h-8 w-full rounded-lg bg-dark-secondary/[0.05] px-2 text-sm"
                />
              </label>
              {dateRangeError ? (
                <p role="alert" className="text-xs text-red-700">
                  {dateRangeError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={applyCustomDateRange}
                className="h-8 rounded-full bg-dark-primary text-xs font-medium text-background"
              >
                Apply range
              </button>
            </div>
          ) : null}
        </div>

        {activeColumnFilterCount > 0 ? (
          <div className="inline-flex items-center gap-1.5">
            <span
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dark-primary/10 bg-white text-dark-primary"
              title={`${activeColumnFilterCount} active filter${
                activeColumnFilterCount === 1 ? "" : "s"
              }`}
            >
              <Filter className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mid-green px-0.5 text-[10px] font-bold text-background">
                {activeColumnFilterCount}
              </span>
            </span>
            <button
              type="button"
              onClick={clearAllColumnFilters}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        <div className="relative min-w-0 flex-1 basis-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green/70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads"
            className="h-9 w-full rounded-full border border-dark-primary/10 bg-white pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-mid-green/30"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowColumns((v) => !v)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dark-primary/10 bg-white text-dark-primary transition hover:bg-dark-secondary/[0.05] ${
            showColumns ? "bg-mid-green/15" : ""
          }`}
          aria-label="Columns"
          title="Columns"
        >
          <Columns3 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>

        <div className="relative" data-import-export="">
          <button
            type="button"
            onClick={() => setShowImportExport((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dark-primary/10 bg-white px-3 text-sm font-medium text-dark-primary hover:bg-dark-secondary/[0.04]"
            aria-expanded={showImportExport}
          >
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.75} />
            Import / Export
            <ChevronDown className="h-3.5 w-3.5 text-mid-green" />
          </button>
          {showImportExport ? (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-dark-primary/10 bg-white py-1 shadow-[0_12px_28px_rgba(11,43,38,0.14)]">
              <a
                href={buildExportHref()}
                onClick={() => setShowImportExport(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-dark-primary hover:bg-dark-secondary/[0.05]"
              >
                <Download className="h-3.5 w-3.5 text-mid-green" />
                Export CSV
              </a>
              <Link
                href="/leads/import"
                onClick={() => setShowImportExport(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-dark-primary hover:bg-dark-secondary/[0.05]"
              >
                <Upload className="h-3.5 w-3.5 text-mid-green" />
                Import CSV
              </Link>
            </div>
          ) : null}
        </div>

        <Link
          href="/leads/assignment-rules"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dark-primary/10 bg-white px-3 text-sm font-medium text-dark-primary hover:bg-dark-secondary/[0.04]"
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
          Assignment Rules
        </Link>

        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-dark-primary text-background hover:bg-dark-secondary"
          aria-label="Create requirement"
          title="Create requirement"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={() => void pollInbox()}
          disabled={polling}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dark-primary/10 bg-white text-dark-primary hover:bg-dark-secondary/[0.05] disabled:opacity-60"
          aria-label="Poll inbox"
          title="Poll inbox"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {openRfq ? (
        <p className="text-xs text-mid-green">
          Showing open RFQs (new, needs review, or parsed).{" "}
          <button
            type="button"
            onClick={() => setOpenRfq(false)}
            className="font-medium underline"
          >
            Show every lead
          </button>
        </p>
      ) : null}
      {appliedRangeError ? (
        <p role="alert" className="text-xs text-red-700">
          {appliedRangeError} The list is not filtered by that range.
        </p>
      ) : null}

      <LeadProcessBar
        activeStage={stage}
        stageCounts={stageCounts}
        countsPending={countsPending}
        onSelect={(next) => {
          setStage(next);
          // All = every lead including Email + WhatsApp — clear source filter
          if (!next) setChannel("");
        }}
        totalAll={allStageTotal || total}
      />

      <div className="flex flex-wrap items-center gap-2">
        {savedViews.length ? (
          <>
            <select
              className="h-8 rounded-full bg-dark-secondary/[0.05] px-3 text-xs"
              value={selectedViewId}
              onChange={(e) => {
                const view = savedViews.find((v) => v.id === e.target.value);
                if (!e.target.value) {
                  setSelectedViewId("");
                  return;
                }
                if (view) applySavedView(view);
              }}
            >
              <option value="">Saved views…</option>
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {viewModified ? (
              <span className="text-xs font-medium text-amber-800">Modified</span>
            ) : null}
            {selectedViewId ? (
              <button
                type="button"
                onClick={() => {
                  const view = savedViews.find((v) => v.id === selectedViewId);
                  if (!view) return;
                  if (!window.confirm(`Delete saved view "${view.name}"?`)) return;
                  void (async () => {
                    await fetch(`/api/leads/saved-views/${view.id}`, {
                      method: "DELETE",
                    });
                    setSelectedViewId("");
                    await refetchSavedViews();
                  })();
                }}
                className="h-8 rounded-full px-2 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Delete view
              </button>
            ) : null}
          </>
        ) : null}
        <input
          value={saveViewName}
          onChange={(e) => setSaveViewName(e.target.value)}
          placeholder="Save view as…"
          className="h-8 min-w-[8rem] rounded-full bg-dark-secondary/[0.05] px-3 text-xs sm:max-w-[11rem]"
        />
        <button
          type="button"
          onClick={() => void saveCurrentView()}
          className="h-8 shrink-0 rounded-full bg-dark-secondary/10 px-3 text-xs font-medium"
        >
          Save view
        </button>
      </div>

      {showColumns ? (
        <div className="flex flex-wrap gap-2 rounded-xl bg-dark-secondary/[0.04] p-3">
          {DEFAULT_LEAD_COLUMNS.map((col) => (
            <label key={col} className="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={columns.includes(col)}
                onChange={(e) => {
                  setColumns((prev) =>
                    e.target.checked
                      ? [...prev, col]
                      : prev.filter((c) => c !== col)
                  );
                }}
              />
              {COLUMN_LABELS[col] || col}
            </label>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-mid-green">{selected.size} selected</span>
          <select
            disabled={bulkBusy}
            className="h-8 rounded-full bg-dark-secondary/[0.05] px-2 text-xs"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              void runBulk("assign", { assignedToUserId: e.target.value });
              e.target.value = "";
            }}
          >
            <option value="">Bulk assign…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <select
            disabled={bulkBusy}
            className="h-8 rounded-full bg-dark-secondary/[0.05] px-2 text-xs"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              const toStage = e.target.value;
              const needsReason =
                toStage === "DISQUALIFIED" || toStage === "DEAL_LOST";
              const reason = needsReason
                ? window.prompt("Reason (required):") || ""
                : "";
              if (needsReason && !reason.trim()) return;
              void runBulk("stage", { toStage, reason });
              e.target.value = "";
            }}
          >
            <option value="">Bulk stage…</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            disabled={bulkBusy}
            className="h-8 rounded-full bg-dark-secondary/[0.05] px-2 text-xs"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              void runBulk("priority", { priority: e.target.value });
              e.target.value = "";
            }}
          >
            <option value="">Bulk priority…</option>
            {LEAD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LEAD_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => {
              if (window.confirm(`Archive ${selected.size} leads?`)) {
                void runBulk("archive");
              }
            }}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-red-50 px-3 text-xs text-red-700"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-xl border border-dark-primary/8 bg-white"
        aria-busy={loading && rows.length === 0}
      >
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 z-20 border-b border-dark-primary/10 bg-white text-xs font-semibold text-dark-primary/80 shadow-[0_1px_0_rgba(11,43,38,0.06)] sm:text-[13px]">
            <tr>
              <th className="w-7 shrink-0 bg-white px-1 py-2.5 sm:w-8 sm:px-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {visibleColumns.map((col) => {
                const filterable = isHeaderFilterCol(col);
                const filterOpen = filterable && headerFilter?.col === col;
                const filterOn = filterable && headerFilterActive(col);

                return (
                  <th
                    key={col}
                    className={`overflow-visible bg-white px-1.5 py-2.5 align-middle sm:px-2 ${COLUMN_CELL_CLASS[col]} ${
                      filterOn ? "bg-mid-green/[0.06]" : ""
                    }`}
                    title={
                      filterOn
                        ? `${COLUMN_LABELS[col]} · filter active`
                        : COLUMN_HEADER_TOOLTIPS[col] || COLUMN_LABELS[col] || undefined
                    }
                  >
                    {filterable ? (
                      <div
                        className="flex min-w-0 items-center gap-1"
                        data-header-filter={col}
                      >
                        <span
                          className={`min-w-0 flex-1 truncate whitespace-nowrap leading-tight ${
                            filterOn
                              ? "font-bold text-dark-primary"
                              : "font-semibold text-dark-primary/80"
                          }`}
                        >
                          {COLUMN_LABELS[col]}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openHeaderFilter(col, e.currentTarget);
                          }}
                          className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                            filterOn
                              ? "bg-dark-primary text-background shadow-sm"
                              : filterOpen
                                ? "bg-mid-green/20 text-dark-primary"
                                : "text-mid-green/80 hover:bg-dark-secondary/10 hover:text-dark-primary"
                          }`}
                          aria-label={`Filter ${COLUMN_LABELS[col]}${
                            filterOn ? " (active)" : ""
                          }`}
                          aria-expanded={Boolean(filterOpen)}
                        >
                          <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
                          {filterOn ? (
                            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold leading-none text-dark-primary">
                              1
                            </span>
                          ) : null}
                        </button>
                      </div>
                    ) : (
                      <span className="block truncate whitespace-nowrap font-semibold leading-tight text-dark-primary/80">
                        {COLUMN_LABELS[col]}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 8 }).map((_, rowIdx) => (
                <tr
                  key={`lead-skel-${rowIdx}`}
                  className="border-t border-dark-primary/5"
                  aria-hidden={rowIdx > 0}
                >
                  <td className="px-1 py-3 sm:px-2">
                    <div className="mx-auto h-3.5 w-3.5 animate-pulse rounded bg-dark-secondary/15" />
                  </td>
                  {visibleColumns.map((col, colIdx) => (
                    <td
                      key={col}
                      className={`px-1.5 py-3 sm:px-2 ${COLUMN_CELL_CLASS[col] || ""}`}
                    >
                      <div
                        className={`h-3.5 animate-pulse rounded-md bg-dark-secondary/15 ${
                          colIdx === 0
                            ? "w-16"
                            : colIdx === 1
                              ? "w-[85%]"
                              : colIdx % 3 === 0
                                ? "w-14"
                                : "w-20"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="px-3 py-8 text-center text-mid-green"
                >
                  No leads match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <LeadsTableRow
                  key={row.id}
                  row={row}
                  visibleColumns={visibleColumns}
                  selected={selected.has(row.id)}
                  drawerActive={drawerLeadId === row.id}
                  contactExpanded={expandedContacts.has(row.id)}
                  quotesPopoverOpen={quotesPopover?.rowId === row.id}
                  promoting={promotingId === row.id}
                  creatingQuote={creatingQuoteId === row.id}
                  onOpen={() => setDrawerLeadId(row.id)}
                  onToggleSelect={() => toggleOne(row.id)}
                  onToggleContact={() => {
                    setExpandedContacts((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    });
                  }}
                  onStageChange={(toStage) =>
                    void changeRowStage(row.id, toStage, row.leadStage)
                  }
                  onPriorityChange={(priority) =>
                    void changeRowPriority(row.id, priority, row.priority)
                  }
                  onPromote={() => void promoteRow(row.id)}
                  onCreateQuote={() => void createQuoteFromLead(row.id)}
                  onRemind={() => openRemind(row)}
                  onLogCall={() => openLogCall(row)}
                  onUpload={() => openUploadDoc(row)}
                  onActivityEnter={(el) => {
                    cancelActivityClose();
                    const { top, left } = fixedPopoverCoords(el, 288, 260);
                    setActivityPopover({
                      rowId: row.id,
                      top,
                      left,
                      items: recentActivityItems(row),
                    });
                  }}
                  onActivityLeave={() => scheduleActivityClose(row.id)}
                  onQuotesToggle={(el) => {
                    const quoteTotal = row._count?.quotes || row.quotes.length;
                    if (quoteTotal <= 1) {
                      setDrawerLeadId(row.id);
                      return;
                    }
                    if (quotesPopover?.rowId === row.id) {
                      setQuotesPopover(null);
                      return;
                    }
                    const { top, left } = fixedPopoverCoords(el, 280, 280);
                    setQuotesPopover({
                      rowId: row.id,
                      top,
                      left,
                      quotes: row.quotes,
                      total: quoteTotal,
                    });
                  }}
                />
              ))
            )}
          </tbody>
        </table>
        <LeadsPagination
          page={page}
          total={total}
          pageSize={LEADS_PAGE_SIZE}
          loading={isFetching}
          unknownTotal={countsPending}
          onPageChange={setPage}
        />
      </div>
      </div>

      <CaptureRequirementDrawer
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCreated={(id) => {
          setActionToast({
            title: "Requirement created",
            tone: "success",
          });
          void load().then(() => setDrawerLeadId(id));
        }}
      />

      <LeadDetailDrawer
        leadId={drawerLeadId}
        open={Boolean(drawerLeadId)}
        onClose={() => setDrawerLeadId(null)}
        users={users}
        onChanged={applyDrawerPatch}
      />

      {remindForm
        ? createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
              <button
                type="button"
                className="absolute inset-0 bg-dark-primary/40"
                aria-label="Close reminder"
                onClick={() => setRemindForm(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remind-title"
                className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-dark-primary/10 bg-white shadow-[0_24px_60px_rgba(11,43,38,0.2)] sm:max-h-[calc(100dvh-2rem)]"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-dark-primary/8 px-5 py-2.5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <p
                      id="remind-title"
                      className="text-sm font-semibold tracking-tight text-dark-primary"
                    >
                      Remind client
                    </p>
                    <p className="truncate text-xs text-mid-green">
                      {remindForm.leadNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemindForm(null)}
                    className="rounded-full p-1 text-mid-green transition-colors hover:bg-dark-secondary/10 hover:text-dark-primary"
                    aria-label="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 lg:overflow-hidden">
                  <div className="mb-3 shrink-0 rounded-xl border border-dark-primary/10">
                    <button
                      type="button"
                      onClick={() =>
                        patchRemindForm({
                          scheduledOpen: !remindForm.scheduledOpen,
                        })
                      }
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      aria-expanded={remindForm.scheduledOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                          Scheduled
                        </span>
                        <span className="rounded-full bg-dark-secondary/[0.08] px-2 py-0.5 text-[11px] font-medium tabular-nums text-dark-primary">
                          {remindForm.scheduledLoading
                            ? "…"
                            : remindForm.scheduled.length}
                        </span>
                      </span>
                      <ChevronDown
                        className={[
                          "h-4 w-4 shrink-0 text-mid-green transition-transform",
                          remindForm.scheduledOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </button>
                    {remindForm.scheduledOpen ? (
                      <div className="border-t border-dark-primary/8 px-3 py-2">
                        {remindForm.scheduledLoading ? (
                          <p className="text-xs text-mid-green">
                            Loading reminders…
                          </p>
                        ) : remindForm.scheduled.length ? (
                          <ul className="grid max-h-28 gap-2 overflow-y-auto [scrollbar-width:thin] sm:grid-cols-2">
                            {remindForm.scheduled.map((item) => {
                              const dueDate = item.dueAt
                                ? new Date(item.dueAt)
                                : null;
                              const overdue = item.status === "OVERDUE";
                              return (
                                <li
                                  key={item.id}
                                  className="flex items-start justify-between gap-3 rounded-lg bg-dark-secondary/[0.04] px-2.5 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-dark-primary">
                                      {item.title || item.type}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-mid-green">
                                      {item.type}
                                      {item.notes ? ` · ${item.notes}` : ""}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p
                                      className={[
                                        "text-xs font-semibold tabular-nums",
                                        overdue
                                          ? "text-amber-700"
                                          : "text-dark-primary",
                                      ].join(" ")}
                                    >
                                      {dueDate &&
                                      !Number.isNaN(dueDate.getTime())
                                        ? format(dueDate, "dd MMM · h:mm a")
                                        : "—"}
                                    </p>
                                    <p
                                      className={[
                                        "mt-0.5 text-[10px] font-medium uppercase tracking-wide",
                                        overdue
                                          ? "text-amber-700"
                                          : "text-mid-green",
                                      ].join(" ")}
                                    >
                                      {overdue ? "Overdue" : "Upcoming"}
                                    </p>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-mid-green">
                            No upcoming reminders on this lead.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.95fr)]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["1h", "In 1 hour"],
                            ["tomorrow", "Tomorrow 10am"],
                            ["3d", "In 3 days"],
                            ["week", "Next week"],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setRemindPreset(key)}
                            className="rounded-full border border-dark-primary/10 bg-white px-3 py-1 text-xs font-medium text-dark-primary transition-colors hover:border-mid-green/40 hover:bg-mid-green/[0.08]"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <DateTimePicker
                        id="remind-when"
                        value={remindForm.due}
                        onChange={(due) => patchRemindForm({ due })}
                      />
                      {remindDueFutureError ? (
                        <p className="text-xs text-red-700" role="alert">
                          {remindDueFutureError}
                        </p>
                      ) : null}

                      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.1fr)]">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                            Type
                          </span>
                          <select
                            value={remindForm.type}
                            onChange={(e) =>
                              patchRemindForm({ type: e.target.value })
                            }
                            className="h-9 w-full rounded-xl border border-dark-primary/10 bg-white px-2.5 text-sm text-dark-primary outline-none transition focus:border-mid-green/40 focus:ring-2 focus:ring-mid-green/15"
                          >
                            {REMIND_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                            Title
                          </span>
                          <input
                            value={remindForm.title}
                            onChange={(e) =>
                              patchRemindForm({ title: e.target.value })
                            }
                            placeholder="What should you remember?"
                            className="h-9 w-full rounded-xl border border-dark-primary/10 bg-white px-3 text-sm text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40 focus:ring-2 focus:ring-mid-green/15"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                            Comment
                          </span>
                          <input
                            value={remindForm.comment}
                            onChange={(e) =>
                              patchRemindForm({ comment: e.target.value })
                            }
                            placeholder="Internal note"
                            className="h-9 w-full rounded-xl border border-dark-primary/10 bg-white px-3 text-sm text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40 focus:ring-2 focus:ring-mid-green/15"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col gap-3">
                      {(() => {
                        const canEmail = Boolean(remindForm.customerEmail);
                        const canWhatsapp = Boolean(remindForm.customerPhone);
                        const showEmail =
                          remindForm.notifyEmail && canEmail;
                        const showWhatsapp =
                          remindForm.notifyWhatsapp && canWhatsapp;
                        const showBoth = showEmail && showWhatsapp;
                        const bothActive =
                          (canEmail ? remindForm.notifyEmail : true) &&
                          (canWhatsapp ? remindForm.notifyWhatsapp : true) &&
                          (canEmail || canWhatsapp);

                        return (
                          <>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={!canEmail}
                          aria-pressed={remindForm.notifyEmail}
                          onClick={() =>
                            patchRemindForm({
                              notifyEmail: true,
                              notifyWhatsapp: false,
                            })
                          }
                          className={[
                            "flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition",
                            !canEmail
                              ? "cursor-not-allowed border-dark-primary/8 bg-dark-secondary/[0.03] opacity-60"
                              : showEmail && !showWhatsapp
                                ? "border-mid-green/40 bg-mid-green/[0.08]"
                                : "border-dark-primary/10 bg-white hover:border-mid-green/30",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium text-dark-primary">
                            <Mail
                              className="h-3.5 w-3.5 text-mid-green"
                              strokeWidth={1.75}
                            />
                            Email
                          </span>
                          <span className="w-full truncate text-[11px] text-mid-green">
                            {remindForm.customerEmail || "No email"}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={!canWhatsapp}
                          aria-pressed={remindForm.notifyWhatsapp}
                          onClick={() =>
                            patchRemindForm({
                              notifyEmail: false,
                              notifyWhatsapp: true,
                            })
                          }
                          className={[
                            "flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition",
                            !canWhatsapp
                              ? "cursor-not-allowed border-dark-primary/8 bg-dark-secondary/[0.03] opacity-60"
                              : showWhatsapp && !showEmail
                                ? "border-mid-green/40 bg-mid-green/[0.08]"
                                : "border-dark-primary/10 bg-white hover:border-mid-green/30",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium text-dark-primary">
                            <MessageCircle
                              className="h-3.5 w-3.5 text-mid-green"
                              strokeWidth={1.75}
                            />
                            WhatsApp
                          </span>
                          <span className="w-full truncate text-[11px] text-mid-green">
                            {remindForm.customerPhone || "No phone"}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={!canEmail && !canWhatsapp}
                          aria-pressed={bothActive}
                          onClick={() =>
                            patchRemindForm({
                              notifyEmail: canEmail,
                              notifyWhatsapp: canWhatsapp,
                            })
                          }
                          className={[
                            "flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left transition",
                            !canEmail && !canWhatsapp
                              ? "cursor-not-allowed border-dark-primary/8 bg-dark-secondary/[0.03] opacity-60"
                              : bothActive
                                ? "border-mid-green/40 bg-mid-green/[0.08]"
                                : "border-dark-primary/10 bg-white hover:border-mid-green/30",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium text-dark-primary">
                            <Columns3
                              className="h-3.5 w-3.5 text-mid-green"
                              strokeWidth={1.75}
                            />
                            Both
                          </span>
                          <span className="w-full truncate text-[11px] text-mid-green">
                            Side-by-side board
                          </span>
                        </button>
                      </div>

                      {!showEmail && !showWhatsapp ? (
                        <div className="flex min-h-[16rem] flex-1 items-center justify-center rounded-xl border border-dashed border-dark-primary/15 bg-dark-secondary/[0.02] px-4 text-center">
                          <p className="text-sm text-mid-green">
                            Choose Email, WhatsApp, or Both to edit the message
                            template.
                          </p>
                        </div>
                      ) : (
                        <div
                          className={[
                            "grid min-h-0 flex-1 gap-3",
                            showBoth ? "lg:grid-cols-2" : "grid-cols-1",
                          ].join(" ")}
                        >
                          {showEmail ? (
                            <div className="flex min-h-0 flex-col rounded-xl border border-mid-green/30 bg-mid-green/[0.04] p-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                                Email template
                              </p>
                              <input
                                value={remindForm.emailSubject}
                                onChange={(e) =>
                                  setRemindForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          emailSubject: e.target.value,
                                          emailEdited: true,
                                        }
                                      : prev
                                  )
                                }
                                placeholder="Subject"
                                className="mb-2 h-8 w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 text-sm text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40"
                              />
                              <textarea
                                value={remindForm.emailBody}
                                onChange={(e) =>
                                  setRemindForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          emailBody: e.target.value,
                                          emailEdited: true,
                                        }
                                      : prev
                                  )
                                }
                                placeholder="Email body"
                                className="min-h-[12rem] flex-1 resize-none rounded-lg border border-dark-primary/10 bg-white px-2.5 py-2 text-sm leading-relaxed text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40"
                              />
                            </div>
                          ) : null}

                          {showWhatsapp ? (
                            <div className="flex min-h-0 flex-col rounded-xl border border-mid-green/30 bg-mid-green/[0.04] p-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                                WhatsApp template
                              </p>
                              <textarea
                                value={remindForm.whatsappBody}
                                onChange={(e) =>
                                  setRemindForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          whatsappBody: e.target.value,
                                          whatsappEdited: true,
                                        }
                                      : prev
                                  )
                                }
                                placeholder="WhatsApp message"
                                className="min-h-[12rem] flex-1 resize-none rounded-lg border border-dark-primary/10 bg-white px-2.5 py-2 text-sm leading-relaxed text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40"
                              />
                            </div>
                          ) : null}
                        </div>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {remindForm.confirmClientSend ? (
                  <div className="shrink-0 border-t border-amber-200/80 bg-amber-50/90 px-5 py-3">
                    <p className="text-sm font-semibold text-dark-primary">
                      Confirm before messaging the client
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-mid-green">
                      {remindForm.notifyEmail && remindForm.customerEmail ? (
                        <li>
                          Email → {remindForm.customerEmail}
                        </li>
                      ) : null}
                      {remindForm.notifyWhatsapp && remindForm.customerPhone ? (
                        <li>
                          WhatsApp → {remindForm.customerPhone}
                        </li>
                      ) : null}
                      <li>
                        Scheduled for{" "}
                        {format(
                          parseLocalDateTimeValue(remindForm.due) ??
                            new Date(remindForm.due),
                          "dd MMM yyyy · h:mm a"
                        )}
                      </li>
                    </ul>
                  </div>
                ) : null}

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-dark-primary/8 bg-dark-secondary/[0.02] px-5 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      remindForm.confirmClientSend
                        ? patchRemindForm({ confirmClientSend: false })
                        : setRemindForm(null)
                    }
                    className="h-9 rounded-full px-4 text-sm font-medium text-mid-green transition-colors hover:bg-dark-secondary/8 hover:text-dark-primary"
                  >
                    {remindForm.confirmClientSend ? "Back" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    disabled={remindForm.saving || Boolean(remindDueFutureError)}
                    onClick={() => void submitRemind()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(45,106,79,0.28)] transition hover:bg-dark-secondary disabled:opacity-60"
                  >
                    <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {remindForm.saving
                      ? "Saving…"
                      : remindForm.confirmClientSend
                        ? "Send to client"
                        : "Continue"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {actionToast
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed right-4 top-4 z-[11000] w-[min(22rem,calc(100vw-2rem))]"
            >
              <div
                className={[
                  "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-white px-3.5 py-3 shadow-[0_12px_30px_rgba(11,43,38,0.16)]",
                  actionToast.tone === "success"
                    ? "border-mid-green/25"
                    : "border-amber-300/60",
                ].join(" ")}
              >
                <CheckCircle2
                  className={[
                    "mt-0.5 h-4 w-4 shrink-0",
                    actionToast.tone === "success"
                      ? "text-mid-green"
                      : "text-amber-600",
                  ].join(" ")}
                  strokeWidth={1.75}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-dark-primary">
                    {actionToast.title}
                  </p>
                  {actionToast.detail ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-mid-green">
                      {actionToast.detail}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setActionToast(null)}
                  className="rounded-full p-0.5 text-mid-green transition hover:bg-dark-secondary/8 hover:text-dark-primary"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {callLogForm
        ? createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4">
              <button
                type="button"
                className="absolute inset-0 bg-dark-primary/40"
                aria-label="Close log call"
                onClick={() => {
                  setCallOutcomeOpen(false);
                  setCallLogForm(null);
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="log-call-title"
                className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-dark-primary/10 bg-white shadow-[0_20px_50px_rgba(11,43,38,0.22)] sm:max-h-[calc(100dvh-2rem)]"
                onMouseDown={(e) => {
                  if (!callOutcomeOpen) return;
                  const target = e.target as HTMLElement | null;
                  if (target?.closest("[data-call-outcome]")) return;
                  setCallOutcomeOpen(false);
                }}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-dark-primary/8 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p
                      id="log-call-title"
                      className="text-base font-semibold text-dark-primary"
                    >
                      Log a call
                    </p>
                    <p className="mt-0.5 text-xs text-mid-green">
                      Capture the outcome of your conversation with{" "}
                      <span className="font-medium text-dark-primary">
                        {callLogForm.contactLabel}
                      </span>
                      .
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCallOutcomeOpen(false);
                      setCallLogForm(null);
                    }}
                    className="rounded-full p-1 text-mid-green hover:bg-dark-secondary/10"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                  <div className="space-y-1.5" data-call-outcome="">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                      Call outcome*
                    </span>
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={callOutcomeOpen}
                      onClick={() => setCallOutcomeOpen((open) => !open)}
                      className={`flex h-11 w-full items-center gap-2 rounded-xl border bg-white px-3 text-left text-sm transition ${
                        callOutcomeOpen
                          ? "border-mid-green/45 ring-2 ring-mid-green/15"
                          : "border-dark-primary/10 hover:border-mid-green/30"
                      }`}
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mid-green/12 text-mid-green">
                        <Phone className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-dark-primary">
                        {callLogForm.outcome}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-mid-green transition-transform ${
                          callOutcomeOpen ? "rotate-180" : ""
                        }`}
                        strokeWidth={1.75}
                      />
                    </button>
                    {callOutcomeOpen ? (
                      <div
                        role="listbox"
                        aria-label="Call outcomes"
                        className="overflow-hidden rounded-xl border border-dark-primary/10 bg-[#f7faf9] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      >
                        <div className="max-h-52 space-y-0.5 overflow-y-auto">
                          {CALL_OUTCOMES.map((outcome) => {
                            const selected = callLogForm.outcome === outcome;
                            return (
                              <button
                                key={outcome}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setCallLogForm((prev) =>
                                    prev ? { ...prev, outcome } : prev
                                  );
                                  setCallOutcomeOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                  selected
                                    ? "bg-white font-medium text-dark-primary shadow-[0_1px_3px_rgba(11,43,38,0.08)] ring-1 ring-mid-green/20"
                                    : "text-dark-primary/90 hover:bg-white/80"
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {outcome}
                                </span>
                                {selected ? (
                                  <Check
                                    className="h-3.5 w-3.5 shrink-0 text-mid-green"
                                    strokeWidth={2.25}
                                  />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                      Call update
                    </span>
                    <textarea
                      value={callLogForm.notes}
                      onChange={(e) =>
                        setCallLogForm((prev) =>
                          prev ? { ...prev, notes: e.target.value } : prev
                        )
                      }
                      rows={4}
                      placeholder="What was discussed, next steps, objections…"
                      className="w-full rounded-xl border border-dark-primary/10 bg-white px-3 py-2.5 text-sm text-dark-primary outline-none transition placeholder:text-mid-green/50 focus:border-mid-green/40 focus:ring-2 focus:ring-mid-green/15"
                    />
                  </label>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
                      Next follow-up date
                    </span>
                    <DateTimePicker
                      id="log-call-follow-up"
                      optional
                      value={callLogForm.followUpDue}
                      onChange={(followUpDue) =>
                        setCallLogForm((prev) =>
                          prev ? { ...prev, followUpDue } : prev
                        )
                      }
                    />
                    {callFollowFutureError ? (
                      <p className="text-xs text-red-700" role="alert">
                        {callFollowFutureError}
                      </p>
                    ) : null}
                    <span className="block text-[10px] text-mid-green/80">
                      Optional — schedules a call follow-up on this lead
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-dark-primary/8 px-5 py-3 sm:px-6">
                  <button
                    type="button"
                    onClick={() => {
                      setCallOutcomeOpen(false);
                      setCallLogForm(null);
                    }}
                    className="h-9 rounded-full px-3 text-sm text-mid-green hover:bg-dark-secondary/8"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      callLogForm.saving || Boolean(callFollowFutureError)
                    }
                    onClick={() => void submitLogCall()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green px-4 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {callLogForm.saving ? "Saving…" : "Log call"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {uploadForm
        ? createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-dark-primary/40"
                aria-label="Close upload document"
                onClick={() => setUploadForm(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-doc-title"
                className="relative z-10 flex max-h-[min(88vh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-dark-primary/10 bg-white shadow-[0_20px_50px_rgba(11,43,38,0.22)]"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
                  <div>
                    <p
                      id="upload-doc-title"
                      className="text-base font-semibold text-dark-primary"
                    >
                      Documents
                      {uploadForm.docs.length > 0
                        ? ` (${uploadForm.docs.length})`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-mid-green">
                      Attach files related to {uploadForm.contactLabel}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadForm(null)}
                    className="rounded-full p-1 text-mid-green hover:bg-dark-secondary/10"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                      Uploaded files
                    </p>
                    {uploadForm.loadingDocs ? (
                      <p className="rounded-xl bg-dark-secondary/[0.04] px-3 py-4 text-center text-xs text-mid-green">
                        Loading documents…
                      </p>
                    ) : uploadForm.docs.length === 0 ? (
                      <p className="rounded-xl bg-dark-secondary/[0.04] px-3 py-4 text-center text-xs text-mid-green">
                        No documents yet
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {uploadForm.docs.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center gap-2 rounded-xl border border-dark-primary/8 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-dark-primary">
                                {doc.fileName}
                              </p>
                              <p className="text-[11px] text-mid-green">
                                {formatAttachmentSize(doc.size)}
                                {doc.note ? ` · ${doc.note}` : ""}
                              </p>
                            </div>
                            <a
                              href={`/api/leads/${uploadForm.leadId}/documents/${doc.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
                              aria-label={`Download ${doc.fileName}`}
                              title="Download"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </a>
                            <button
                              type="button"
                              onClick={() => void deleteLeadDocument(doc.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-red-50 hover:text-red-700"
                              aria-label={`Delete ${doc.fileName}`}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept={LEAD_DOC_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const next = e.target.files?.[0] || null;
                      setUploadForm((prev) =>
                        prev ? { ...prev, file: next } : prev
                      );
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = e.dataTransfer.files?.[0] || null;
                      if (next) {
                        setUploadForm((prev) =>
                          prev ? { ...prev, file: next } : prev
                        );
                      }
                    }}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-dark-primary/20 bg-dark-secondary/[0.04] px-4 py-6 text-center hover:border-mid-green/40 hover:bg-mid-green/[0.06]"
                  >
                    <Upload className="h-5 w-5 text-mid-green" strokeWidth={1.75} />
                    {uploadForm.file ? (
                      <>
                        <span className="max-w-full truncate text-sm font-medium text-dark-primary">
                          {uploadForm.file.name}
                        </span>
                        <span className="text-[11px] text-mid-green">
                          {(uploadForm.file.size / 1024).toFixed(1)} KB · click
                          to change
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-dark-primary">
                          Drop a file here or click to browse
                        </span>
                        <span className="text-[11px] text-mid-green">
                          PDF, Office, images, CSV · max 20MB
                        </span>
                      </>
                    )}
                  </button>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                      Note
                    </span>
                    <textarea
                      value={uploadForm.note}
                      onChange={(e) =>
                        setUploadForm((prev) =>
                          prev ? { ...prev, note: e.target.value } : prev
                        )
                      }
                      rows={2}
                      placeholder="Optional context for this document…"
                      className="w-full rounded-xl bg-dark-secondary/[0.05] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-mid-green/30"
                    />
                  </label>
                </div>

                <div className="flex shrink-0 justify-end gap-2 border-t border-dark-primary/8 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setUploadForm(null)}
                    className="h-9 rounded-full px-3 text-sm text-mid-green hover:bg-dark-secondary/8"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={uploadForm.saving || !uploadForm.file}
                    onClick={() => void submitUploadDoc()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green px-4 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {uploadForm.saving ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {quotesPopover
        ? createPortal(
            <div
              data-quotes-popover=""
              className="fixed z-[9999] w-[17.5rem] overflow-hidden rounded-xl border border-dark-primary/10 bg-white shadow-[0_12px_32px_rgba(11,43,38,0.18)]"
              style={{
                top: quotesPopover.top,
                left: quotesPopover.left,
              }}
            >
              <div className="flex items-center justify-between border-b border-dark-primary/8 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-mid-green">
                  All quotes · {quotesPopover.total}
                </p>
                <button
                  type="button"
                  onClick={() => setQuotesPopover(null)}
                  className="rounded-full p-0.5 text-mid-green hover:bg-dark-secondary/10"
                  aria-label="Close quotes"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="max-h-64 space-y-0.5 overflow-y-auto p-1.5">
                {quotesPopover.quotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/quotes/${q.id}`}
                    prefetch={false}
                    onClick={() => setQuotesPopover(null)}
                    className="block rounded-lg px-2 py-1.5 hover:bg-dark-secondary/[0.06]"
                  >
                    <span className="block truncate text-xs font-medium text-dark-primary">
                      {q.quoteNumber}
                      <span className="font-normal text-mid-green">
                        {" "}
                        · {quotePopoverTitle(q)}
                      </span>
                    </span>
                    <span className="block truncate text-[10px] text-mid-green">
                      {q.status.replaceAll("_", " ")}
                      {q.sentAt || q.status !== "DRAFT"
                        ? ` · ${money(q.grandTotal)}`
                        : " · draft"}
                      {q.version > 1 ? ` · v${q.version}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}

      {headerFilter
        ? createPortal(
            <div
              data-header-filter-panel=""
              className="fixed z-[10000] w-[14.25rem] overflow-hidden rounded-xl border border-dark-primary/10 bg-white p-2 shadow-[0_16px_40px_rgba(11,43,38,0.2)]"
              style={{
                top: headerFilter.top,
                left: headerFilter.left,
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-mid-green">
                  {COLUMN_LABELS[headerFilter.col]}
                </p>
                <button
                  type="button"
                  onClick={() => clearHeaderFilter(headerFilter.col)}
                  className="shrink-0 text-[10px] text-mid-green hover:underline"
                >
                  Clear
                </button>
              </div>

              {headerFilter.col === "leadId" ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setChannel("");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(!channel)}
                  >
                    All sources
                  </button>
                  {PRIMARY_LEAD_CHANNELS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setChannel(c);
                        setHeaderFilter(null);
                      }}
                      className={filterOptionClass(channel === c)}
                    >
                      {LEAD_CHANNEL_LABELS[c]}
                    </button>
                  ))}
                  {Object.entries(LEAD_CHANNEL_LABELS)
                    .filter(
                      ([k]) =>
                        !PRIMARY_LEAD_CHANNELS.includes(
                          k as (typeof PRIMARY_LEAD_CHANNELS)[number]
                        )
                    )
                    .map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setChannel(k);
                          setHeaderFilter(null);
                        }}
                        className={filterOptionClass(channel === k)}
                      >
                        {v}
                      </button>
                    ))}
                </div>
              ) : null}

              {headerFilter.col === "requirement" ? (
                <div className="space-y-1.5">
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Category…"
                    className="h-8 w-full rounded-lg bg-dark-secondary/[0.05] px-2 text-xs outline-none focus:ring-1 focus:ring-mid-green/30"
                    autoFocus
                  />
                  <div className="max-h-44 space-y-0.5 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setCategory("");
                        setHeaderFilter(null);
                      }}
                      className={filterOptionClass(!category.trim())}
                    >
                      All categories
                    </button>
                    {categoryOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setCategory(opt);
                          setHeaderFilter(null);
                        }}
                        className={`${filterOptionClass(category === opt)} truncate`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {headerFilter.col === "stage" ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(!stage)}
                  >
                    All stages
                  </button>
                  {LEAD_STAGES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setStage(s);
                        setHeaderFilter(null);
                      }}
                      className={filterOptionClass(stage === s)}
                    >
                      {LEAD_STAGE_LABELS[s]}
                    </button>
                  ))}
                </div>
              ) : null}

              {headerFilter.col === "priority" ? (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPriority("");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(!priority)}
                  >
                    All priorities
                  </button>
                  {LEAD_PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPriority(p);
                        setHeaderFilter(null);
                      }}
                      className={filterOptionClass(priority === p)}
                    >
                      {LEAD_PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              ) : null}

              {headerFilter.col === "assignedTo" ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignee("");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(!assignee)}
                  >
                    All owners
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignee("unassigned");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(assignee === "unassigned")}
                  >
                    Unassigned
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignee("me");
                      setHeaderFilter(null);
                    }}
                    className={filterOptionClass(assignee === "me")}
                  >
                    Me
                  </button>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setAssignee(u.id);
                        setHeaderFilter(null);
                      }}
                      className={`${filterOptionClass(assignee === u.id)} truncate`}
                    >
                      {u.name || u.email}
                    </button>
                  ))}
                </div>
              ) : null}

            </div>,
            document.body
          )
        : null}

      {activityPopover
        ? createPortal(
            <div
              role="tooltip"
              className="fixed z-[9999] flex w-[18rem] flex-col overflow-hidden rounded-xl border border-dark-primary/10 bg-white shadow-[0_12px_32px_rgba(11,43,38,0.18)]"
              style={{
                top: activityPopover.top,
                left: activityPopover.left,
              }}
              onMouseEnter={cancelActivityClose}
              onMouseLeave={() =>
                scheduleActivityClose(activityPopover.rowId)
              }
            >
              <p className="shrink-0 border-b border-dark-primary/8 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-mid-green">
                Recent activity
                {activityPopover.items.length
                  ? ` · ${activityPopover.items.length}`
                  : ""}
              </p>
              {activityPopover.items.length ? (
                <div
                  className={`space-y-1.5 px-3 py-2 ${
                    activityPopover.items.length > 4
                      ? "max-h-[14.5rem] overflow-y-auto overscroll-contain"
                      : ""
                  }`}
                >
                  {activityPopover.items.map((a) => (
                    <div
                      key={a.id}
                      className="border-l-2 border-mid-green/30 pl-2"
                    >
                      <p className="text-[11px] font-medium text-dark-primary">
                        {a.title || a.type}
                      </p>
                      {a.body ? (
                        <p className="line-clamp-2 text-[10px] text-mid-green">
                          {a.body}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-mid-green/70">
                        {relativeTime(a.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-[11px] text-mid-green">
                  No quote activity yet.
                </p>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
