"use client";

import Papa from "papaparse";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { TelemarketingContactDrawer } from "@/components/telemarketing/telemarketing-contact-drawer";
import { CallStatusDropdown } from "@/components/telemarketing/call-status-dropdown";
import { CallStatusProcessBar } from "@/components/telemarketing/call-status-process-bar";
import { InlineEditableCell } from "@/components/telemarketing/inline-editable-cell";
import { TelemarketingPagination } from "@/components/telemarketing/telemarketing-pagination";
import type { TelemarketingCallStatus } from "@prisma/client";
import { useToast } from "@/components/app-toast";
import { CallbackDueModal } from "@/components/telemarketing/callback-due-modal";
import { ConfirmModal } from "@/components/telemarketing/confirm-modal";
import { useTelemarketingChrome } from "@/components/telemarketing/telemarketing-chrome";
import { partitionTelemarketingTags } from "@/lib/telemarketing/tag-groups";
import {
  contactRequiresPhoneOrEmail,
  validateEmailInput,
  validatePhoneInput,
} from "@/lib/telemarketing/validation";

const NEW_CONTACT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  company: "Company",
  role: "Role",
  phone: "Phone",
  email: "Email",
};

type SortColumn = "createdAt" | "company" | "name" | "callStatus";

type UserRef = { id: string; name: string; email: string };

type ContactRow = {
  id: string;
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  callStatus: TelemarketingCallStatus;
  createdAt: string;
  updatedAt: string;
  assignedTo: UserRef | null;
  reminders: Array<{ id: string; type: string; dueAt: string; notes: string }>;
  _count?: { alternatives: number };
};

type TagOption = { tag: string; count: number };

const fieldClass =
  "h-9 rounded-md border border-dark-primary/10 bg-white px-3 text-[13px] text-dark-primary outline-none focus:border-mid-green/50 focus:ring-1 focus:ring-mid-green/20";

const PAGE_SIZE = 50;

export function TelemarketingWorkbench() {
  const { toast } = useToast();
  const { setDrawerOpen } = useTelemarketingChrome();
  const [items, setItems] = useState<ContactRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFetching, setListFetching] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [qInput, setQInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [source, setSource] = useState<string>("ALL");
  const [view, setView] = useState<"active" | "archived">("active");
  const [assignee, setAssignee] = useState("ALL");
  const [districtTag, setDistrictTag] = useState("ALL");
  const [boardTag, setBoardTag] = useState("ALL");
  const [altDraftErrors, setAltDraftErrors] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<SortColumn>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const fetchGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [callbackPrompt, setCallbackPrompt] = useState<{ contactId: string; label: string } | null>(
    null
  );
  const [confirmAction, setConfirmAction] = useState<{
    type: "lead" | "archive";
    contactId: string;
    label: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [newFormErrors, setNewFormErrors] = useState<Record<number, string>>({});
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, ContactRow[]>>({});
  const [altDraft, setAltDraft] = useState<Record<string, { name: string; phone: string; email: string; role: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMapping, setImportMapping] = useState({
    name: "",
    company: "",
    role: "",
    phone: "",
    email: "",
  });
  const [importAssignee, setImportAssignee] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const [newContacts, setNewContacts] = useState([
    { name: "", company: "", role: "", phone: "", email: "", assignedToUserId: "" },
  ]);

  const moreFiltersActive =
    assignee !== "ALL" || districtTag !== "ALL" || boardTag !== "ALL";

  useEffect(() => {
    if (!moreFiltersOpen) return;
    function onPointer(e: MouseEvent) {
      if (!moreFiltersRef.current?.contains(e.target as Node)) setMoreFiltersOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreFiltersOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreFiltersOpen]);

  useEffect(() => {
    const handle = window.setTimeout(() => setQDebounced(qInput.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [qInput]);

  const listQueryBase = useMemo(() => {
    const p = new URLSearchParams();
    if (qDebounced) p.set("q", qDebounced);
    if (status !== "ALL") p.set("status", status);
    if (source !== "ALL") p.set("source", source);
    if (assignee !== "ALL") p.set("assignee", assignee === "UNASSIGNED" ? "unassigned" : assignee);
    const activeTag = districtTag !== "ALL" ? districtTag : boardTag !== "ALL" ? boardTag : null;
    if (activeTag) p.set("tag", activeTag);
    p.set("view", view);
    p.set("sort", sortAsc ? "asc" : "desc");
    p.set("sortBy", sortBy);
    p.set("take", String(PAGE_SIZE));
    return p.toString();
  }, [qDebounced, status, source, view, assignee, districtTag, boardTag, sortAsc, sortBy]);

  const initialLoadedRef = useRef(false);

  const loadContactsPage = useCallback(
    async (skip: number) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++fetchGenRef.current;

      if (!initialLoadedRef.current) setLoading(true);
      else setListFetching(true);

      try {
        const params = new URLSearchParams(listQueryBase);
        params.set("skip", String(skip));
        const [listRes, usersRes, tagsRes] = await Promise.all([
          fetch(`/api/telemarketing/contacts?${params}`, { signal: ac.signal }),
          fetch("/api/leads/users", { signal: ac.signal }),
          fetch("/api/telemarketing/tags", { signal: ac.signal }),
        ]);
        if (gen !== fetchGenRef.current) return;

        const list = await listRes.json();
        const usersData = await usersRes.json();
        const tagsData = await tagsRes.json();
        const nextItems: ContactRow[] = list.items || [];
        const nextTotal = list.total || 0;

        setItems(nextItems);
        setStatusCounts(list.statusCounts || {});
        setTotal(nextTotal);
        setUsers(usersData.items || []);
        setTagOptions(tagsData.tags || []);
        initialLoadedRef.current = true;
        setInitialLoaded(true);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        throw e;
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setListFetching(false);
        }
      }
    },
    [listQueryBase]
  );

  useEffect(() => {
    setPage(0);
    initialLoadedRef.current = false;
    setInitialLoaded(false);
  }, [listQueryBase]);

  useEffect(() => {
    void loadContactsPage(page * PAGE_SIZE);
  }, [page, listQueryBase, loadContactsPage]);

  function toggleSort(column: SortColumn) {
    if (sortBy === column) setSortAsc((v) => !v);
    else {
      setSortBy(column);
      setSortAsc(false);
    }
  }

  const searchFiltersActive =
    Boolean(qDebounced) ||
    source !== "ALL" ||
    assignee !== "ALL" ||
    districtTag !== "ALL" ||
    boardTag !== "ALL";

  function emptyTableMessage() {
    if (view === "archived") return "No archived contacts";
    if (searchFiltersActive) return "No contacts match your search";
    if (status !== "ALL") return "No contacts in this status";
    return "No contacts yet";
  }

  const refreshList = useCallback(() => {
    setPage(0);
    void loadContactsPage(0);
  }, [loadContactsPage]);

  const { district: districtTags, board: boardTags } = useMemo(
    () => partitionTelemarketingTags(tagOptions),
    [tagOptions]
  );

  const openDrawer = useCallback(
    (id: string) => {
      setDrawerId(id);
      setDrawerOpen(true);
    },
    [setDrawerOpen]
  );

  const closeDrawer = useCallback(() => {
    setDrawerId(null);
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  async function patchField(id: string, field: string, value: string) {
    if (field === "phone") {
      const v = validatePhoneInput(value);
      if (!v.ok) {
        toast(v.error, "error");
        throw new Error(v.error);
      }
    }
    if (field === "email") {
      const v = validateEmailInput(value);
      if (!v.ok) {
        toast(v.error, "error");
        throw new Error(v.error);
      }
    }
    const res = await fetch(`/api/telemarketing/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data.error === "string" ? data.error : "Update failed";
      toast(msg, "error");
      throw new Error(msg);
    }
    setItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, [field]: value.trim() } : r))
    );
  }

  async function patchStatus(
    id: string,
    callStatus: TelemarketingCallStatus,
    callbackDueAt?: string
  ) {
    const body: Record<string, unknown> = { callStatus };
    if (callbackDueAt) body.callbackDueAt = callbackDueAt;
    const res = await fetch(`/api/telemarketing/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast("Could not update status", "error");
      return;
    }
    if (data.leadNumber) {
      toast(`Lead ${data.leadNumber} created`, "success");
    }
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, callStatus } : r)));
    refreshList();
  }

  function handleStatusPick(row: ContactRow, next: TelemarketingCallStatus) {
    if (next === "CALL_BACK_REQUESTED") {
      setCallbackPrompt({
        contactId: row.id,
        label: row.name || row.company || row.phone || "Contact",
      });
      return false;
    }
  }

  async function patchAssignee(contactId: string, assignedToUserId: string | null) {
    await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToUserId }),
    });
    refreshList();
  }

  function requestMoveToLead(row: ContactRow) {
    setConfirmAction({
      type: "lead",
      contactId: row.id,
      label: row.name || row.company || row.phone || "this contact",
    });
  }

  function requestArchive(row: ContactRow) {
    setConfirmAction({
      type: "archive",
      contactId: row.id,
      label: row.name || row.company || row.phone || "this contact",
    });
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.type === "lead") {
        const res = await fetch(`/api/telemarketing/contacts/${confirmAction.contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveToLead: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(typeof data.error === "string" ? data.error : "Could not move to lead", "error");
          return;
        }
        if (data.leadNumber) toast(`Lead ${data.leadNumber} created`, "success");
        else toast("Moved to lead", "success");
      } else {
        const res = await fetch(`/api/telemarketing/contacts/${confirmAction.contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archive: true }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast(typeof data.error === "string" ? data.error : "Could not archive", "error");
          return;
        }
        toast("Contact archived", "success");
      }
      setConfirmAction(null);
      refreshList();
    } finally {
      setConfirmBusy(false);
    }
  }

  async function toggleExpand(parent: ContactRow) {
    if (expanded[parent.id]) {
      setExpanded((e) => {
        const next = { ...e };
        delete next[parent.id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/telemarketing/contacts?primaryContactId=${parent.id}`);
    const data = await res.json();
    setExpanded((e) => ({ ...e, [parent.id]: data.items || [] }));
  }

  async function saveAlternative(primaryId: string) {
    const draft = altDraft[primaryId];
    if (!draft) return;
    if (!contactRequiresPhoneOrEmail(draft.phone, draft.email)) {
      const msg = "Phone or email is required";
      setAltDraftErrors((e) => ({ ...e, [primaryId]: msg }));
      return;
    }
    const phoneV = validatePhoneInput(draft.phone);
    if (!phoneV.ok) {
      setAltDraftErrors((e) => ({ ...e, [primaryId]: phoneV.error }));
      return;
    }
    const emailV = validateEmailInput(draft.email);
    if (!emailV.ok) {
      setAltDraftErrors((e) => ({ ...e, [primaryId]: emailV.error }));
      return;
    }
    setAltDraftErrors((e) => {
      const next = { ...e };
      delete next[primaryId];
      return next;
    });
    const res = await fetch(`/api/telemarketing/contacts/${primaryId}/alternatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(typeof data.error === "string" ? data.error : "Could not add contact", "error");
      return;
    }
    setAltDraft((d) => {
      const next = { ...d };
      delete next[primaryId];
      return next;
    });
    const listRes = await fetch(`/api/telemarketing/contacts?primaryContactId=${primaryId}`);
    const listData = await listRes.json();
    setExpanded((e) => ({ ...e, [primaryId]: listData.items || [] }));
    refreshList();
    toast("Alternative contact added", "success");
  }

  async function submitNewContacts() {
    const localErrors: Record<number, string> = {};
    newContacts.forEach((c, i) => {
      if (!c.phone.trim() && !c.email.trim()) {
        localErrors[i] = "Phone or email is required";
      }
    });
    setNewFormErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setNewSubmitting(true);
    try {
      const contacts = newContacts.map((c) => ({
        ...c,
        assignedToUserId: c.assignedToUserId || null,
      }));
      const res = await fetch("/api/telemarketing/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(
          typeof data.error === "string" ? data.error : "Could not create contacts",
          "error"
        );
        return;
      }
      const apiErrors = (data.errors || []) as { index: number; error: string }[];
      if (apiErrors.length) {
        const mapped: Record<number, string> = {};
        for (const err of apiErrors) mapped[err.index] = err.error;
        setNewFormErrors(mapped);
        if (!data.createdIds?.length) return;
      }
      if (!data.createdIds?.length) {
        toast("No contacts were created", "error");
        return;
      }
      setNewOpen(false);
      setNewFormErrors({});
      setNewContacts([
        { name: "", company: "", role: "", phone: "", email: "", assignedToUserId: "" },
      ]);
      refreshList();
      toast("Contact(s) added", "success");
    } finally {
      setNewSubmitting(false);
    }
  }

  function onImportFile(file: File) {
    void file.text().then((text) => {
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      const headers = parsed.meta.fields?.filter(Boolean) as string[] | undefined;
      setImportHeaders(headers || []);
      setImportRows(parsed.data);
      const guess = (keys: string[]) =>
        headers?.find((h) => keys.some((k) => h.toLowerCase().includes(k))) || "";
      setImportMapping({
        name: guess(["name", "contact"]),
        company: guess(["company"]),
        role: guess(["role", "designation"]),
        phone: guess(["phone", "mobile"]),
        email: guess(["email"]),
      });
      setImportStep(2);
    });
  }

  async function runImport() {
    await fetch("/api/telemarketing/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: importRows,
        mapping: importMapping,
        assignedToUserId: importAssignee || null,
      }),
    });
    setImportOpen(false);
    setImportStep(1);
    setImportRows([]);
    refreshList();
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(row: ContactRow, index: number, opts?: { child?: boolean }) {
    const child = opts?.child;
    const altCount = row._count?.alternatives ?? 0;
    return (
      <tr
        key={row.id}
        className={`group border-t border-dark-primary/6 text-[12px] hover:bg-background ${child ? "bg-dark-secondary/[0.04]" : "cursor-pointer"}`}
        onClick={() => {
          if (!child) openDrawer(row.id);
        }}
      >
        <td className="w-8 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          {!child ? (
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggleSelect(row.id)}
              className="rounded border-dark-primary/20"
            />
          ) : null}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-mid-green">
          <div className="flex items-center gap-0.5">
            {!child && altCount > 0 ? (
              <button
                type="button"
                className="rounded p-0.5 hover:bg-dark-secondary/10"
                title="View linked contacts"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleExpand(row);
                }}
              >
                {expanded[row.id] ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
            {child ? <span className="text-mid-green">↳</span> : null}
            {index + 1 + page * PAGE_SIZE}
          </div>
        </td>
        <td className="min-w-[12rem] px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <InlineEditableCell
                value={row.company}
                placeholder="No company"
                fieldLabel="Company"
                fullWidth
                onSave={(v) => patchField(row.id, "company", v)}
              />
              {row.role?.trim() ? (
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-mid-green">
                  {row.role.trim()}
                </p>
              ) : null}
            </div>
            {!child ? (
              <button
                type="button"
                title="Add alternative contact"
                aria-label="Add alternative contact"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-mid-green/25 bg-light-green/25 text-mid-green hover:bg-light-green/40"
                onClick={(e) => {
                  e.stopPropagation();
                  setAltDraft((d) => ({
                    ...d,
                    [row.id]: d[row.id] || { name: "", phone: "", email: "", role: "" },
                  }));
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.name}
            placeholder="Unnamed contact"
            fieldLabel={row.company?.trim() || row.name?.trim() || "contact"}
            onSave={(v) => patchField(row.id, "name", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.phone}
            emptyActionLabel="Add phone"
            fieldLabel="Phone"
            monospace
            onSave={(v) => patchField(row.id, "phone", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.email}
            emptyActionLabel="Add email"
            fieldLabel="Email"
            onSave={(v) => patchField(row.id, "email", v)}
          />
        </td>
        <td
          className="relative z-0 px-2 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <CallStatusDropdown
            status={row.callStatus}
            onBeforeChange={(s) => handleStatusPick(row, s)}
            onChange={(s) => patchStatus(row.id, s)}
            onMoveToLead={() => requestMoveToLead(row)}
          />
        </td>
        <td className="min-w-[8.5rem] px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="relative w-full min-w-[7.5rem] max-w-[9.5rem]">
            <select
              className="h-8 w-full appearance-none rounded-lg border-0 bg-dark-primary/[0.06] py-1.5 pl-2.5 pr-7 text-[11px] font-medium text-dark-primary outline-none"
              value={row.assignedTo?.id || ""}
              onChange={(e) => patchAssignee(row.id, e.target.value ? e.target.value : null)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-primary/55" />
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-mid-green">
          {format(new Date(row.createdAt), "d MMM yyyy")}
        </td>
        <td
          className="sticky right-0 z-20 w-[6.75rem] border-l border-dark-primary/8 bg-white px-2 py-1.5 shadow-[-8px_0_12px_rgba(11,43,38,0.08)] group-hover:bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <IconAction
              label="Open timeline"
              onClick={() => openDrawer(row.id)}
              tone="green"
            >
              <Clock className="h-4 w-4" />
            </IconAction>
            <IconAction label="Mark as lead" onClick={() => requestMoveToLead(row)} tone="green-fill">
              <UserRound className="h-4 w-4" />
            </IconAction>
            <IconAction label="Archive contact" onClick={() => requestArchive(row)} tone="danger">
              <Archive className="h-4 w-4" />
            </IconAction>
          </div>
        </td>
      </tr>
    );
  }

  const toolbarSelectClass =
    "h-9 appearance-none rounded-lg border border-dark-primary/10 bg-white py-1.5 pl-3 pr-8 text-[13px] text-dark-primary outline-none focus:border-mid-green/40";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pb-32">
      <div className="shrink-0 rounded-xl border border-dark-primary/8 bg-gradient-to-b from-white to-[#f3f5f4] px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="mr-auto flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dark-secondary text-background">
              <Phone className="h-4 w-4" strokeWidth={2} />
            </div>
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-dark-primary">
              Telemarketing
            </h1>
            {listFetching ? (
              <span className="text-[11px] text-mid-green" aria-live="polite">
                Updating…
              </span>
            ) : null}
          </div>

          <div className="relative min-w-[14rem] w-full max-w-xs sm:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-primary/35" />
            <input
              className="h-9 w-full rounded-lg border border-dark-primary/10 bg-white py-1.5 pl-9 pr-3 text-[13px] text-dark-primary outline-none placeholder:text-dark-primary/40 focus:border-mid-green/40"
              placeholder="Search contacts..."
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              aria-busy={listFetching}
            />
          </div>

          <div className="relative">
            <select
              className={toolbarSelectClass}
              value={view}
              onChange={(e) => setView(e.target.value as "active" | "archived")}
            >
              <option value="active">View: Active</option>
              <option value="archived">View: Archived</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-primary/45" />
          </div>

          <div className="relative">
            <select
              className={toolbarSelectClass}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="ALL">Source: All</option>
              <option value="IMPORTED">Source: Imported</option>
              <option value="MANUAL">Source: Manual</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-primary/45" />
          </div>

          <div className="relative" ref={moreFiltersRef}>
            <button
              type="button"
              onClick={() => setMoreFiltersOpen((o) => !o)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-dark-primary/10 bg-white px-3 text-[13px] text-dark-primary ${
                moreFiltersActive ? "border-mid-green/40 ring-1 ring-mid-green/15" : ""
              }`}
              aria-expanded={moreFiltersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-mid-green" />
              More Filters
              {moreFiltersActive ? (
                <span className="rounded-full bg-mid-green/15 px-1.5 text-[10px] font-semibold text-mid-green">
                  On
                </span>
              ) : null}
            </button>
            {moreFiltersOpen ? (
              <div className="absolute right-0 z-30 mt-1.5 w-72 space-y-2 rounded-lg border border-dark-primary/10 bg-white p-3 shadow-[0_12px_32px_rgba(11,43,38,0.16)]">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-mid-green">Assignee</span>
                  <select
                    className={`${fieldClass} w-full`}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="ALL">All</option>
                    <option value="UNASSIGNED">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-mid-green">District</span>
                  <select
                    className={`${fieldClass} w-full`}
                    value={districtTag}
                    onChange={(e) => {
                      setDistrictTag(e.target.value);
                      if (e.target.value !== "ALL") setBoardTag("ALL");
                    }}
                  >
                    <option value="ALL">All</option>
                    {districtTags.map((t) => (
                      <option key={t.tag} value={t.tag}>
                        {t.tag} ({t.count})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-mid-green">Board</span>
                  <select
                    className={`${fieldClass} w-full`}
                    value={boardTag}
                    onChange={(e) => {
                      setBoardTag(e.target.value);
                      if (e.target.value !== "ALL") setDistrictTag("ALL");
                    }}
                  >
                    <option value="ALL">All</option>
                    {boardTags.map((t) => (
                      <option key={t.tag} value={t.tag}>
                        {t.tag} ({t.count})
                      </option>
                    ))}
                  </select>
                </label>
                {moreFiltersActive ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-mid-green hover:underline"
                    onClick={() => {
                      setAssignee("ALL");
                      setDistrictTag("ALL");
                      setBoardTag("ALL");
                    }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setImportOpen(true);
              setImportStep(1);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-dark-secondary px-3.5 text-[13px] font-medium text-background hover:bg-dark-primary"
          >
            <Upload className="h-4 w-4" /> Import Contacts
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dark-primary/12 bg-white px-3 text-[13px] font-medium text-dark-primary hover:bg-background"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-dark-primary/10 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[1040px]">
            <CallStatusProcessBar
              activeStatus={status}
              statusCounts={statusCounts}
              onSelect={(next) => {
                setStatus(next);
                setPage(0);
              }}
              countsPending={!initialLoaded}
            />
        <table className="w-full table-fixed text-left">
          <thead className="sticky top-0 z-10 border-b border-dark-primary/10 bg-[#f7f8f7] text-[10px] font-semibold uppercase tracking-wide text-mid-green">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="w-12 px-2 py-2">S.No.</th>
              <th className="w-[16rem] px-2 py-2">
                <SortHeader label="Company" active={sortBy === "company"} asc={sortAsc} onClick={() => toggleSort("company")} />
              </th>
              <th className="w-[8rem] px-2 py-2">
                <SortHeader label="Name" active={sortBy === "name"} asc={sortAsc} onClick={() => toggleSort("name")} />
              </th>
              <th className="w-[7.5rem] px-2 py-2">Phone Number</th>
              <th className="w-[9rem] px-2 py-2">Email</th>
              <th className="w-[10.5rem] px-2 py-2">
                <SortHeader label="Call Status" active={sortBy === "callStatus"} asc={sortAsc} onClick={() => toggleSort("callStatus")} />
              </th>
              <th className="w-[8.5rem] px-2 py-2">Assigned to</th>
              <th className="w-[5.5rem] px-2 py-2">
                <SortHeader label="Added" active={sortBy === "createdAt"} asc={sortAsc} onClick={() => toggleSort("createdAt")} />
              </th>
              <th className="sticky right-0 z-20 w-[6.75rem] border-l border-dark-primary/8 bg-[#f7f8f7] px-2 py-2 shadow-[-8px_0_12px_rgba(11,43,38,0.08)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <TableSkeletonRows />
            ) : items.length === 0 && !listFetching ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-mid-green">
                  {emptyTableMessage()}
                </td>
              </tr>
            ) : (
              items.flatMap((row, i) => {
                const rows = [renderRow(row, i)];
                if (altDraft[row.id]) {
                  const draft = altDraft[row.id];
                  rows.push(
                    <tr key={`${row.id}-draft`} className="border-t border-dark-primary/6 bg-rose-50/30">
                      <td />
                      <td className="px-2 py-2 text-mid-green">↳</td>
                      <td className="px-2 py-2 text-xs text-mid-green" colSpan={2}>
                        Alternative draft
                      </td>
                      <td className="px-2 py-1.5" colSpan={6}>
                        <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className={fieldClass}
                            placeholder="Unnamed contact"
                            value={draft.name}
                            onChange={(e) =>
                              setAltDraft((d) => ({
                                ...d,
                                [row.id]: { ...draft, name: e.target.value },
                              }))
                            }
                          />
                          <input
                            className={fieldClass}
                            placeholder="Add phone"
                            value={draft.phone}
                            onChange={(e) =>
                              setAltDraft((d) => ({
                                ...d,
                                [row.id]: { ...draft, phone: e.target.value },
                              }))
                            }
                          />
                          <input
                            className={fieldClass}
                            placeholder="Add email"
                            value={draft.email}
                            onChange={(e) =>
                              setAltDraft((d) => ({
                                ...d,
                                [row.id]: { ...draft, email: e.target.value },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="rounded-md bg-dark-secondary px-3 py-1.5 text-xs text-background"
                            onClick={() => void saveAlternative(row.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            title="Discard"
                            aria-label="Discard alternative contact draft"
                            className="rounded-md border border-rose-200 p-1.5 text-rose-700"
                            onClick={() =>
                              setAltDraft((d) => {
                                const next = { ...d };
                                delete next[row.id];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {altDraftErrors[row.id] ? (
                          <p className="text-xs text-rose-600">{altDraftErrors[row.id]}</p>
                        ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (expanded[row.id]) {
                  for (const child of expanded[row.id]) {
                    rows.push(renderRow(child, i, { child: true }));
                  }
                }
                return rows;
              })
            )}
          </tbody>
        </table>
          </div>
        </div>
        <TelemarketingPagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          loading={listFetching || loading}
          unknownTotal={!initialLoaded}
          onPageChange={setPage}
        />
      </div>

      {callbackPrompt ? (
        <CallbackDueModal
          open
          contactLabel={callbackPrompt.label}
          onClose={() => setCallbackPrompt(null)}
          onConfirm={async (dueAtIso) => {
            await patchStatus(callbackPrompt.contactId, "CALL_BACK_REQUESTED", dueAtIso);
            setCallbackPrompt(null);
          }}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "archive" ? "Archive contact?" : "Move to lead?"}
        description={
          confirmAction?.type === "archive"
            ? `Archive ${confirmAction.label}? They’ll move out of the active list and can be found under View: Archived.`
            : `Create a lead from ${confirmAction?.label || "this contact"}? This moves them into Leads.`
        }
        confirmLabel={confirmAction?.type === "archive" ? "Archive" : "Move to lead"}
        tone={confirmAction?.type === "archive" ? "danger" : "primary"}
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmAction(null);
        }}
        onConfirm={runConfirmedAction}
      />

      {drawerId ? (
        <TelemarketingContactDrawer
          contactId={drawerId}
          users={users}
          onClose={closeDrawer}
          onChanged={() => refreshList()}
        />
      ) : null}

      {newOpen ? (
        <ModalShell onClose={() => setNewOpen(false)} title="New contact(s)">
          <p className="text-sm text-mid-green">Phone or email is required for each contact.</p>
          {newContacts.map((c, i) => (
            <div key={i} className="mt-3 space-y-2 rounded-lg border border-dark-primary/8 p-3">
              <p className="text-xs font-medium text-mid-green">Contact {i + 1}</p>
              {newFormErrors[i] ? (
                <p className="text-sm text-rose-600">{newFormErrors[i]}</p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {(["name", "company", "role", "phone", "email"] as const).map((field) => (
                  <label key={field} className="flex flex-col gap-1 text-xs text-mid-green">
                    {NEW_CONTACT_FIELD_LABELS[field]}
                    <input
                      className={fieldClass}
                      value={c[field]}
                      onChange={(e) => {
                        const next = [...newContacts];
                        next[i] = { ...next[i], [field]: e.target.value };
                        setNewContacts(next);
                        if (newFormErrors[i]) {
                          setNewFormErrors((errs) => {
                            const copy = { ...errs };
                            delete copy[i];
                            return copy;
                          });
                        }
                      }}
                    />
                  </label>
                ))}
                <select
                  className={fieldClass}
                  value={c.assignedToUserId}
                  onChange={(e) => {
                    const next = [...newContacts];
                    next[i] = { ...next[i], assignedToUserId: e.target.value };
                    setNewContacts(next);
                  }}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="mt-2 text-sm text-mid-green underline"
            onClick={() =>
              setNewContacts([
                ...newContacts,
                { name: "", company: "", role: "", phone: "", email: "", assignedToUserId: "" },
              ])
            }
          >
            + Contact
          </button>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setNewOpen(false)} className="px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={newSubmitting}
              onClick={() => void submitNewContacts()}
              className="rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {newSubmitting ? "Adding…" : "Add contact(s)"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {importOpen ? (
        <ModalShell onClose={() => setImportOpen(false)} title="Bulk import contacts">
          {importStep === 1 ? (
            <>
              <label className="text-xs text-mid-green">
                Assign all to
                <select
                  className={`${fieldClass} mt-1 w-full`}
                  value={importAssignee}
                  onChange={(e) => setImportAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-dark-primary/20 bg-dark-secondary/[0.03] px-4 py-10 text-sm text-mid-green">
                Drop CSV here or click to upload (.csv)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportFile(f);
                  }}
                />
              </label>
            </>
          ) : null}
          {importStep === 2 ? (
            <div className="space-y-2 text-sm">
              <p className="text-mid-green">Map columns</p>
              {(["name", "company", "role", "phone", "email"] as const).map((field) => (
                <label key={field} className="flex items-center justify-between gap-2 text-xs">
                  {field}
                  <select
                    className={fieldClass}
                    value={importMapping[field]}
                    onChange={(e) => setImportMapping({ ...importMapping, [field]: e.target.value })}
                  >
                    <option value="">—</option>
                    {importHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <ModalNav onBack={() => setImportStep(1)} onNext={() => setImportStep(3)} nextLabel="Review" />
            </div>
          ) : null}
          {importStep === 3 ? (
            <div className="text-sm">
              <p className="text-mid-green">{importRows.length} rows ready to import.</p>
              <ModalNav onBack={() => setImportStep(2)} onNext={() => void runImport()} nextLabel="Import" />
            </div>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-0.5 hover:text-dark-primary ${active ? "text-dark-primary" : ""}`}
      onClick={onClick}
    >
      {label}
      {active ? (asc ? "↑" : "↓") : ""}
    </button>
  );
}

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={10} className="px-3 py-2">
            <div className="h-9 animate-pulse rounded-md bg-dark-secondary/10" />
          </td>
        </tr>
      ))}
    </>
  );
}

function IconAction({
  children,
  label,
  onClick,
  tone,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone: "green" | "green-fill" | "danger";
}) {
  const cls =
    tone === "green-fill"
      ? "bg-dark-secondary text-background hover:bg-dark-primary"
      : tone === "danger"
        ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
        : "border border-mid-green/25 bg-light-green/25 text-mid-green hover:bg-light-green/40";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${cls}`}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-dark-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-mid-green" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalNav({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="mt-4 flex justify-between">
      <button type="button" onClick={onBack} className="text-sm text-mid-green">
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        className="rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium text-background"
      >
        {nextLabel}
      </button>
    </div>
  );
}