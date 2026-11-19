"use client";

import Papa from "papaparse";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { TelemarketingContactDrawer } from "@/components/telemarketing/telemarketing-contact-drawer";
import { CallStatusDropdown } from "@/components/telemarketing/call-status-dropdown";
import { InlineEditableCell } from "@/components/telemarketing/inline-editable-cell";
import {
  TELEMARKETING_CALL_STATUSES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";
import type { TelemarketingCallStatus } from "@prisma/client";
import { useToast } from "@/components/app-toast";

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
  const [items, setItems] = useState<ContactRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [source, setSource] = useState<string>("ALL");
  const [view, setView] = useState<"active" | "archived">("active");
  const [assignee, setAssignee] = useState("ALL");
  const [districtTag, setDistrictTag] = useState("ALL");
  const [sortAsc, setSortAsc] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
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
  const [newContacts, setNewContacts] = useState([
    { name: "", company: "", role: "", phone: "", email: "", assignedToUserId: "" },
  ]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status !== "ALL") p.set("status", status);
    if (source !== "ALL") p.set("source", source);
    if (assignee !== "ALL") p.set("assignee", assignee === "UNASSIGNED" ? "unassigned" : assignee);
    if (districtTag !== "ALL") p.set("tag", districtTag);
    p.set("view", view);
    p.set("sort", sortAsc ? "asc" : "desc");
    p.set("take", String(PAGE_SIZE));
    p.set("skip", String(skip));
    return p.toString();
  }, [q, status, source, view, assignee, districtTag, sortAsc, skip]);

  const refresh = useCallback(
    async (mode: "replace" | "append" = "replace") => {
      if (mode === "append") setLoadingMore(true);
      else setLoading(true);
      try {
        const [listRes, usersRes, tagsRes] = await Promise.all([
          fetch(`/api/telemarketing/contacts?${queryString}`),
          fetch("/api/leads/users"),
          fetch("/api/telemarketing/tags"),
        ]);
        const list = await listRes.json();
        const usersData = await usersRes.json();
        const tagsData = await tagsRes.json();
        const nextItems: ContactRow[] = list.items || [];
        setItems((prev) => (mode === "append" ? [...prev, ...nextItems] : nextItems));
        setStatusCounts(list.statusCounts || {});
        setHasMore(Boolean(list.hasMore));
        setTotal(list.total || 0);
        setUsers(usersData.items || []);
        setTagOptions(tagsData.tags || []);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    setSkip(0);
  }, [q, status, source, view, assignee, districtTag, sortAsc]);

  useEffect(() => {
    void refresh(skip === 0 ? "replace" : "append");
  }, [refresh, skip]);

  const districtTags = useMemo(
    () => tagOptions.filter((t) => t.tag.includes("district") || t.tag === "area"),
    [tagOptions]
  );

  async function patchField(id: string, field: string, value: string) {
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

  async function patchStatus(id: string, callStatus: TelemarketingCallStatus) {
    const res = await fetch(`/api/telemarketing/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callStatus }),
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
    void refresh("replace");
  }

  async function patchAssignee(contactId: string, assignedToUserId: string | null) {
    await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToUserId }),
    });
    void refresh("replace");
  }

  async function moveToLead(contactId: string) {
    if (!window.confirm("Move this contact to Leads?")) return;
    const res = await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveToLead: true }),
    });
    const data = await res.json();
    if (res.ok && data.leadNumber) toast(`Lead ${data.leadNumber} created`, "success");
    void refresh("replace");
  }

  async function archiveContact(contactId: string) {
    if (!window.confirm("Archive this contact?")) return;
    await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    void refresh("replace");
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
    void refresh("replace");
    toast("Alternative contact added", "success");
  }

  async function submitNewContacts() {
    const contacts = newContacts.map((c) => ({
      ...c,
      assignedToUserId: c.assignedToUserId || null,
    }));
    await fetch("/api/telemarketing/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts }),
    });
    setNewOpen(false);
    setNewContacts([
      { name: "", company: "", role: "", phone: "", email: "", assignedToUserId: "" },
    ]);
    void refresh("replace");
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
    void refresh("replace");
  }

  const statusChips = [
    { key: "ALL", label: "All" },
    ...TELEMARKETING_CALL_STATUSES.map((s) => ({
      key: s,
      label: TELEMARKETING_CALL_STATUS_LABELS[s],
    })),
  ];

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
        className={`border-t border-dark-primary/6 text-[12px] hover:bg-[#faf9f6] ${child ? "bg-dark-secondary/[0.04]" : "cursor-pointer"}`}
        onClick={() => {
          if (!child) setDrawerId(row.id);
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
            {index + 1 + skip}
          </div>
        </td>
        <td className="max-w-[10rem] px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <InlineEditableCell
              value={row.company}
              placeholder="No company"
              onSave={(v) => patchField(row.id, "company", v)}
            />
            {!child ? (
              <button
                type="button"
                title="Add alternative contact"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-mid-green/25 bg-[#e8f5e6] text-mid-green hover:bg-[#d4e7d0]"
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
            onSave={(v) => patchField(row.id, "name", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.phone}
            emptyActionLabel="Add phone"
            monospace
            onSave={(v) => patchField(row.id, "phone", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.email}
            emptyActionLabel="Add email"
            onSave={(v) => patchField(row.id, "email", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <InlineEditableCell
            value={row.role}
            placeholder="-"
            onSave={(v) => patchField(row.id, "role", v)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <CallStatusDropdown
            status={row.callStatus}
            onChange={(s) => patchStatus(row.id, s)}
            onMoveToLead={() => moveToLead(row.id)}
          />
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <select
            className="max-w-[8.5rem] rounded-md border border-mid-green/20 bg-[#e8f5e6]/60 px-2 py-1 text-[11px]"
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
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-mid-green">
          {format(new Date(row.createdAt), "d MMM yyyy")}
        </td>
        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <IconAction title="Open timeline" onClick={() => setDrawerId(row.id)} tone="green">
              <Clock className="h-4 w-4" />
            </IconAction>
            <IconAction title="Mark as lead" onClick={() => moveToLead(row.id)} tone="green-fill">
              <UserRound className="h-4 w-4" />
            </IconAction>
            <IconAction title="Archive contact" onClick={() => archiveContact(row.id)} tone="danger">
              <Archive className="h-4 w-4" />
            </IconAction>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-24">
      <PageHeader
        title="Telemarketing"
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportStep(1);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2f4a2b] px-3 py-2 text-sm font-medium text-white shadow-sm"
            >
              <Upload className="h-4 w-4" /> Import contacts
            </button>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2f4a2b] px-3 py-2 text-sm font-medium text-white shadow-sm"
            >
              <Plus className="h-4 w-4" /> New contact
            </button>
          </>
        }
      />

      <WorkbenchCard>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green/60" />
            <input
              className={`${fieldClass} w-full pl-9`}
              placeholder="Search contacts"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className={fieldClass} value={view} onChange={(e) => setView(e.target.value as "active" | "archived")}>
            <option value="active">View: Active</option>
            <option value="archived">View: Archived</option>
          </select>
          <select className={fieldClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="ALL">Source: All</option>
            <option value="IMPORTED">Imported</option>
            <option value="MANUAL">Manual</option>
          </select>
          <select className={fieldClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="ALL">Assignee: All</option>
            <option value="UNASSIGNED">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <select className={fieldClass} value={districtTag} onChange={(e) => setDistrictTag(e.target.value)}>
            <option value="ALL">District / tag: All</option>
            {districtTags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
              </option>
            ))}
            {tagOptions
              .filter((t) => !districtTags.some((d) => d.tag === t.tag))
              .slice(0, 40)
              .map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {statusChips.map((chip) => {
            const active = status === chip.key;
            const count = statusCounts[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatus(chip.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "bg-[#2f4a2b] text-white"
                    : "border border-dark-primary/10 bg-white text-dark-primary hover:bg-[#faf9f6]"
                }`}
              >
                {chip.label}
                {count != null ? (
                  <span
                    className={`rounded-full px-1.5 py-0 text-[10px] ${active ? "bg-white/20" : "bg-dark-secondary/10"}`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-mid-green">
          Showing {items.length} of {total} contacts
        </p>
      </WorkbenchCard>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-dark-primary/10 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] text-left">
          <thead className="sticky top-0 z-10 border-b border-dark-primary/10 bg-[#faf9f6] text-[10px] font-semibold uppercase tracking-wide text-mid-green">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2">S.No.</th>
              <th className="px-2 py-2">Company</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Phone</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Call status</th>
              <th className="px-2 py-2">Assigned to</th>
              <th className="px-2 py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-dark-primary"
                  onClick={() => setSortAsc((v) => !v)}
                >
                  Added {sortAsc ? "↑" : "↓"}
                </button>
              </th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-sm text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-sm text-mid-green">
                  No contacts yet.
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
                      <td className="px-2 py-1.5" colSpan={7}>
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
                            className="rounded-md bg-[#2f4a2b] px-3 py-1.5 text-xs text-white"
                            onClick={() => void saveAlternative(row.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            title="Discard"
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

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
            className="rounded-md border border-dark-primary/15 bg-white px-4 py-2 text-sm font-medium text-dark-primary hover:bg-[#faf9f6] disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {drawerId ? (
        <TelemarketingContactDrawer
          contactId={drawerId}
          users={users}
          onClose={() => setDrawerId(null)}
          onChanged={() => void refresh("replace")}
        />
      ) : null}

      {newOpen ? (
        <ModalShell onClose={() => setNewOpen(false)} title="New contact(s)">
          <p className="text-sm text-mid-green">Email or phone required per contact.</p>
          {newContacts.map((c, i) => (
            <div key={i} className="mt-3 space-y-2 rounded-lg border border-dark-primary/8 p-3">
              <p className="text-xs font-medium text-mid-green">Contact {i + 1}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["name", "company", "role", "phone", "email"] as const).map((field) => (
                  <input
                    key={field}
                    className={fieldClass}
                    placeholder={field}
                    value={c[field]}
                    onChange={(e) => {
                      const next = [...newContacts];
                      next[i] = { ...next[i], [field]: e.target.value };
                      setNewContacts(next);
                    }}
                  />
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
              onClick={() => void submitNewContacts()}
              className="rounded-md bg-[#2f4a2b] px-4 py-2 text-sm font-medium text-white"
            >
              Add contact(s)
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

function IconAction({
  children,
  title,
  onClick,
  tone,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  tone: "green" | "green-fill" | "danger";
}) {
  const cls =
    tone === "green-fill"
      ? "bg-[#2f4a2b] text-white hover:bg-[#243b22]"
      : tone === "danger"
        ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
        : "border border-mid-green/25 bg-[#e8f5e6] text-mid-green hover:bg-[#d4e7d0]";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${cls}`}
    >
      {children}
    </button>
  );
}

function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold text-dark-primary">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function WorkbenchCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dark-primary/10 bg-white p-4 shadow-sm">
      {title ? <p className="mb-2 text-sm font-medium text-dark-primary">{title}</p> : null}
      {children}
    </div>
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
        className="rounded-md bg-[#2f4a2b] px-4 py-2 text-sm font-medium text-white"
      >
        {nextLabel}
      </button>
    </div>
  );
}