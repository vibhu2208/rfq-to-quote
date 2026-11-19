"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  Copy,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  User,
  UserCircle,
  X,
} from "lucide-react";
import { CallStatusDropdown } from "@/components/telemarketing/call-status-dropdown";
import { CallStatusPill } from "@/components/telemarketing/status-chip";
import { TelemarketingTimelineList } from "@/components/telemarketing/timeline-ui";
import {
  DateTimePicker,
  toLocalDateTimeValue,
  parseLocalDateTimeValue,
} from "@/components/ui/date-time-picker";
import {
  LOG_CALL_STATUSES,
  REMINDER_TYPES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";
import { useToast } from "@/components/app-toast";
import type { TelemarketingCallStatus } from "@prisma/client";
import { CallbackDueModal } from "@/components/telemarketing/callback-due-modal";
import { ConfirmModal } from "@/components/telemarketing/confirm-modal";
import {
  defaultLogCallStatus,
  formatTelemarketingInstant,
  validateFutureDateTime,
} from "@/lib/telemarketing/datetime";
import {
  validateEmailInput,
  validatePhoneInput,
} from "@/lib/telemarketing/validation";

type UserRef = { id: string; name: string; email: string };

type ContactDetail = {
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
  calls: Array<{
    id: string;
    status: string;
    note: string;
    followUpAt: string | null;
    createdAt: string;
    actor: UserRef | null;
  }>;
  reminders: Array<{
    id: string;
    type: string;
    status: string;
    dueAt: string;
    notes: string;
    assignedTo: UserRef | null;
  }>;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
    actor: UserRef | null;
  }>;
  alternatives: Array<{
    id: string;
    name: string;
    role: string;
    phone: string;
    email: string;
    company: string;
    callStatus: TelemarketingCallStatus;
  }>;
  convertedLead: {
    id: string;
    leadNumber: string;
    leadStage: string;
    quotes: Array<{ id: string; quoteNumber: string; status: string }>;
  } | null;
};

type Tab = "calls" | "reminders" | "timeline" | "linked";

export function TelemarketingContactDrawer({
  contactId,
  users,
  onClose,
  onChanged,
}: {
  contactId: string;
  users: UserRef[];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadGenRef = useRef(0);
  const hasContactRef = useRef(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const [logOpen, setLogOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [logStatus, setLogStatus] = useState<(typeof LOG_CALL_STATUSES)[number]>("CONNECTED");
  const [logNote, setLogNote] = useState("");
  const [logFollowUp, setLogFollowUp] = useState("");
  const [reminderType, setReminderType] = useState<(typeof REMINDER_TYPES)[number]["value"]>("CALL");
  const [reminderDue, setReminderDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalDateTimeValue(d);
  });
  const [reminderNotes, setReminderNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [logError, setLogError] = useState("");
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [leadConfirmOpen, setLeadConfirmOpen] = useState(false);
  const [leadConfirmBusy, setLeadConfirmBusy] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [tagAdding, setTagAdding] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ name: "", phone: "", email: "", role: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [nowMs] = useState(() => Date.now());

  const logFollowUpDate = useMemo(
    () => (logFollowUp ? parseLocalDateTimeValue(logFollowUp) : null),
    [logFollowUp]
  );
  const logFollowUpInvalid = Boolean(
    logFollowUpDate && validateFutureDateTime(logFollowUpDate)
  );
  const logSubmitDisabled = !logNote.trim() || saving || logFollowUpInvalid;
  const logDisabledReason = !logNote.trim()
    ? "Add a call update before logging."
    : logFollowUpInvalid
      ? validateFutureDateTime(logFollowUpDate!) || "Follow-up must be in the future."
      : "";

  const reminderDueDate = useMemo(
    () => parseLocalDateTimeValue(reminderDue),
    [reminderDue]
  );
  const reminderInvalid = Boolean(
    reminderDueDate && validateFutureDateTime(reminderDueDate)
  );
  const reminderSubmitDisabled = !reminderNotes.trim() || saving || reminderInvalid;
  const reminderDisabledReason = !reminderNotes.trim()
    ? "Reminder notes are required."
    : reminderInvalid
      ? validateFutureDateTime(reminderDueDate!) || "Due time must be in the future."
      : "";

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    if (hasContactRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/telemarketing/contacts/${contactId}`);
      const data = await res.json();
      if (gen !== loadGenRef.current) return;
      const next = data.contact || null;
      setContact(next);
      hasContactRef.current = Boolean(next);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (
        logOpen ||
        reminderOpen ||
        callbackOpen ||
        leadConfirmOpen ||
        linkFormOpen
      ) {
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, logOpen, reminderOpen, callbackOpen, leadConfirmOpen, linkFormOpen]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data.error === "string" ? data.error : "Update failed";
      toast(msg, "error");
      throw new Error(msg);
    }
    if (data.leadNumber) toast(`Lead ${data.leadNumber} created`, "success");
    await load();
    onChanged?.();
    return data;
  }

  async function patchAssignee(userId: string | null) {
    await patch({ assignedToUserId: userId || null });
  }

  async function patchStatus(callStatus: TelemarketingCallStatus, callbackDueAt?: string) {
    const body: Record<string, unknown> = { callStatus };
    if (callbackDueAt) body.callbackDueAt = callbackDueAt;
    await patch(body);
  }

  function handleDrawerStatusPick(next: TelemarketingCallStatus) {
    if (next === "CALL_BACK_REQUESTED") {
      setCallbackOpen(true);
      return false;
    }
  }

  function moveToLead() {
    setLeadConfirmOpen(true);
  }

  async function confirmMoveToLead() {
    setLeadConfirmBusy(true);
    try {
      await patch({ moveToLead: true });
      setLeadConfirmOpen(false);
    } finally {
      setLeadConfirmBusy(false);
    }
  }

  async function saveField(field: string, value: string) {
    if (field === "phone") {
      const v = validatePhoneInput(value);
      if (!v.ok) {
        setFieldError(v.error);
        throw new Error(v.error);
      }
    }
    if (field === "email") {
      const v = validateEmailInput(value);
      if (!v.ok) {
        setFieldError(v.error);
        throw new Error(v.error);
      }
    }
    setFieldError("");
    await patch({ [field]: value });
    setEditField(null);
  }

  async function addTag() {
    if (!contact || !tagInput.trim()) return;
    const next = [...new Set([...contact.tags, tagInput.trim().toLowerCase()])];
    setTagInput("");
    await patch({ tags: next });
  }

  async function removeTag(tag: string) {
    if (!contact) return;
    await patch({ tags: contact.tags.filter((t) => t !== tag) });
  }

  async function addNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setNoteSaving(true);
    const optimistic = {
      id: `tmp-${Date.now()}`,
      type: "NOTE",
      title: "Note",
      body,
      createdAt: new Date().toISOString(),
      actor: null,
    };
    setContact((c) => (c ? { ...c, timeline: [optimistic, ...c.timeline] } : c));
    setNoteDraft("");
    try {
      await patch({ note: body });
    } catch {
      await load();
    } finally {
      setNoteSaving(false);
    }
  }

  async function submitLogCall() {
    if (!logNote.trim()) {
      setLogError("Call update is required");
      return;
    }
    const followUpAt = parseLocalDateTimeValue(logFollowUp);
    if (followUpAt) {
      const err = validateFutureDateTime(followUpAt);
      if (err) {
        setLogError(err);
        return;
      }
    }
    setLogError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/telemarketing/contacts/${contactId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: logStatus,
          note: logNote.trim(),
          followUpAt: followUpAt ? followUpAt.toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Could not log call";
        setLogError(msg);
        toast(msg, "error");
        return;
      }
      setLogOpen(false);
      setLogNote("");
      setLogFollowUp("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  function openLogCallModal() {
    if (contact) {
      setLogStatus(
        defaultLogCallStatus(contact.callStatus) as (typeof LOG_CALL_STATUSES)[number]
      );
    }
    setLogError("");
    setLogOpen(true);
  }

  async function submitReminder() {
    if (!reminderNotes.trim()) return;
    const due = parseLocalDateTimeValue(reminderDue);
    if (!due) return;
    setSaving(true);
    try {
      await fetch(`/api/telemarketing/contacts/${contactId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reminderType,
          dueAt: due.toISOString(),
          notes: reminderNotes.trim(),
        }),
      });
      setReminderOpen(false);
      setReminderNotes("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function completeReminder(id: string) {
    await fetch(`/api/telemarketing/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    await load();
  }

  async function submitLinkedContact() {
    setLinkError("");
    if (!linkDraft.phone.trim() && !linkDraft.email.trim()) {
      setLinkError("Phone or email is required");
      return;
    }
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/telemarketing/contacts/${contactId}/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Could not link contact";
        setLinkError(msg);
        toast(msg, "error");
        return;
      }
      setLinkDraft({ name: "", phone: "", email: "", role: "" });
      setLinkFormOpen(false);
      toast("Linked contact added", "success");
      await load();
      onChanged?.();
    } finally {
      setLinkSaving(false);
    }
  }

  async function copyContactDetails() {
    if (!contact) return;
    const lines = [
      contact.name?.trim() || "",
      contact.company?.trim() || "",
      contact.role?.trim() || "",
      contact.phone?.trim() || "",
      contact.email?.trim() || "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast("Contact details copied", "success");
    } catch {
      toast("Could not copy", "error");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "calls", label: "Calls" },
    { id: "reminders", label: "Reminders" },
    { id: "timeline", label: "Timeline" },
    { id: "linked", label: "Linked" },
  ];

  const title =
    contact?.name?.trim() || contact?.company?.trim() || (loading ? "Loading…" : "Contact");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-dark-primary/40"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[40rem] flex-col border-l border-dark-primary/10 bg-white shadow-[-16px_0_48px_rgba(11,43,38,0.2)] sm:max-w-[44rem]">
        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-light-green/35 text-dark-secondary">
              <Phone className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight text-dark-primary">
                      {title}
                    </h2>
                    {refreshing ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-mid-green" aria-label="Refreshing" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-mid-green">
                    Added {contact ? formatTelemarketingInstant(contact.createdAt) : "…"}
                    {contact ? (
                      <>
                        {" · Updated "}
                        {formatTelemarketingInstant(contact.updatedAt, { withTime: true })}
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-mid-green hover:bg-dark-secondary/8 hover:text-dark-primary"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading && !contact ? (
          <div className="px-5 py-10 text-sm text-mid-green">Loading…</div>
        ) : !contact ? (
          <div className="px-5 py-10 text-sm text-mid-green">Contact not found.</div>
        ) : (
          <>
            {/* Meta strip */}
            <div className="mx-5 grid grid-cols-2 gap-y-3 border-y border-dark-primary/8 py-3 sm:grid-cols-4 sm:divide-x sm:divide-dark-primary/8">
              <MetaCell label="Source">
                <span className="font-semibold capitalize text-dark-primary">
                  {contact.source.toLowerCase()}
                </span>
              </MetaCell>
              <MetaCell label="Status">
                <CallStatusDropdown
                  status={contact.callStatus}
                  onBeforeChange={handleDrawerStatusPick}
                  onChange={patchStatus}
                  onMoveToLead={moveToLead}
                />
              </MetaCell>
              <MetaCell label="Assigned To">
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-transparent pr-5 text-sm font-semibold text-dark-primary outline-none"
                    value={contact.assignedTo?.id || ""}
                    onChange={(e) => patchAssignee(e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
                </div>
              </MetaCell>
              <MetaCell label="Tags">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {contact.tags.length ? (
                      contact.tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="rounded-md bg-light-green/30 px-1.5 py-0.5 text-[10px] font-medium text-dark-secondary hover:bg-rose-100 hover:text-rose-800"
                          onClick={() => removeTag(t)}
                          title="Remove tag"
                        >
                          {t} ×
                        </button>
                      ))
                    ) : (
                      <span className="text-sm text-mid-green">No tags</span>
                    )}
                    {!tagAdding ? (
                      <button
                        type="button"
                        onClick={() => setTagAdding(true)}
                        className="inline-flex items-center gap-0.5 rounded-md bg-light-green/35 px-1.5 py-0.5 text-[10px] font-semibold text-dark-secondary hover:bg-light-green/50"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    ) : null}
                  </div>
                  {tagAdding ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="min-w-0 flex-1 rounded-md border border-dark-primary/10 px-1.5 py-0.5 text-[11px] outline-none focus:border-mid-green/40"
                        placeholder="Tag"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void addTag().then(() => setTagAdding(false));
                          }
                          if (e.key === "Escape") {
                            setTagAdding(false);
                            setTagInput("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void addTag().then(() => setTagAdding(false))}
                        className="rounded-md bg-dark-secondary px-2 text-[10px] font-medium text-background"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </div>
              </MetaCell>
            </div>

            {/* Contact details accordion */}
            <div className="mx-5 mt-3 overflow-hidden rounded-xl bg-background">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setDetailsOpen((v) => !v)}
                >
                  <ChevronDown
                    className={`h-4 w-4 text-mid-green transition ${detailsOpen ? "" : "-rotate-90"}`}
                  />
                  <span className="text-sm font-semibold text-dark-primary">Contact Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyContactDetails()}
                  className="rounded-md p-1.5 text-mid-green hover:bg-dark-secondary/8 hover:text-dark-primary"
                  aria-label="Copy contact details"
                  title="Copy"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {detailsOpen ? (
                <div className="grid gap-0 border-t border-dark-primary/6 px-2 py-2 sm:grid-cols-3 sm:divide-x sm:divide-dark-primary/8">
                  <CompactDetail
                    icon={<User className="h-3.5 w-3.5" />}
                    value={contact.name}
                    placeholder="No name"
                    editing={editField === "name"}
                    draft={fieldDraft}
                    onStart={() => {
                      setEditField("name");
                      setFieldDraft(contact.name);
                      setFieldError("");
                    }}
                    onDraft={setFieldDraft}
                    error={editField === "name" ? fieldError : ""}
                    onSave={() => void saveField("name", fieldDraft)}
                    onCancel={() => {
                      setEditField(null);
                      setFieldError("");
                    }}
                  />
                  <CompactDetail
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    value={contact.company}
                    placeholder="No company"
                    editing={editField === "company"}
                    draft={fieldDraft}
                    onStart={() => {
                      setEditField("company");
                      setFieldDraft(contact.company);
                    }}
                    onDraft={setFieldDraft}
                    onSave={() => void saveField("company", fieldDraft)}
                    onCancel={() => setEditField(null)}
                  />
                  <CompactDetail
                    icon={<Phone className="h-3.5 w-3.5" />}
                    value={contact.phone}
                    placeholder="No phone"
                    editing={editField === "phone"}
                    draft={fieldDraft}
                    onStart={() => {
                      setEditField("phone");
                      setFieldDraft(contact.phone);
                      setFieldError("");
                    }}
                    onDraft={setFieldDraft}
                    error={editField === "phone" ? fieldError : ""}
                    onSave={() => void saveField("phone", fieldDraft).catch(() => undefined)}
                    onCancel={() => {
                      setEditField(null);
                      setFieldError("");
                    }}
                  />
                  <CompactDetail
                    icon={<Mail className="h-3.5 w-3.5" />}
                    value={contact.email}
                    placeholder="No email"
                    editing={editField === "email"}
                    draft={fieldDraft}
                    onStart={() => {
                      setEditField("email");
                      setFieldDraft(contact.email);
                      setFieldError("");
                    }}
                    onDraft={setFieldDraft}
                    error={editField === "email" ? fieldError : ""}
                    onSave={() => void saveField("email", fieldDraft).catch(() => undefined)}
                    onCancel={() => {
                      setEditField(null);
                      setFieldError("");
                    }}
                  />
                  <CompactDetail
                    icon={<UserCircle className="h-3.5 w-3.5" />}
                    value={contact.role}
                    placeholder="No board / role"
                    editing={editField === "role"}
                    draft={fieldDraft}
                    onStart={() => {
                      setEditField("role");
                      setFieldDraft(contact.role);
                    }}
                    onDraft={setFieldDraft}
                    onSave={() => void saveField("role", fieldDraft)}
                    onCancel={() => setEditField(null)}
                  />
                </div>
              ) : null}
            </div>

            {/* Tabs */}
            <div className="mt-2 flex shrink-0 gap-1 px-3">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative flex-1 px-2 py-2.5 text-sm transition ${
                    tab === t.id
                      ? "font-semibold text-dark-primary"
                      : "text-mid-green hover:text-dark-primary"
                  }`}
                >
                  {t.label}
                  {tab === t.id ? (
                    <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-dark-secondary" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {tab === "calls" ? (
                <div className="space-y-3 rounded-xl bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-dark-primary">
                      {contact.calls.length} call{contact.calls.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      onClick={openLogCallModal}
                      className="inline-flex items-center gap-1 rounded-md bg-dark-secondary px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-primary"
                    >
                      <Phone className="h-3.5 w-3.5" /> Log call
                    </button>
                  </div>
                  {contact.calls.length === 0 ? (
                    <EmptyBlock
                      title="No calls logged yet"
                      hint="Log a call to track outcomes and follow-ups."
                    />
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-dark-primary/10 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-white text-[10px] uppercase text-mid-green">
                          <tr>
                            <th className="px-3 py-2">Update</th>
                            <th className="px-3 py-2">Logged</th>
                            <th className="px-3 py-2">Follow-up</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contact.calls.map((c) => (
                            <tr key={c.id} className="border-t border-dark-primary/6">
                              <td className="px-3 py-2">
                                <CallStatusPill
                                  status={c.status as ContactDetail["callStatus"]}
                                  compact
                                />
                                <p className="mt-1 break-words text-xs text-mid-green">{c.note}</p>
                              </td>
                              <td className="px-3 py-2 text-xs text-mid-green">
                                {formatTelemarketingInstant(c.createdAt, { withTime: true })}
                              </td>
                              <td className="px-3 py-2 text-xs text-mid-green">
                                {c.followUpAt
                                  ? formatTelemarketingInstant(c.followUpAt, { withTime: true })
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "reminders" ? (
                <div className="space-y-3 rounded-xl bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-dark-primary">
                      {contact.reminders.length} reminder
                      {contact.reminders.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setReminderOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-dark-secondary px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-primary"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add reminder
                    </button>
                  </div>
                  {contact.reminders.length === 0 ? (
                    <EmptyBlock
                      title="No reminders added yet"
                      hint="Reminders will appear here once they are added."
                    />
                  ) : (
                    <ul className="space-y-2">
                      {contact.reminders.map((r) => {
                        const overdue =
                          r.status === "PENDING" && new Date(r.dueAt).getTime() < nowMs;
                        return (
                        <li
                          key={r.id}
                          className={`rounded-lg border bg-white p-3 text-sm ${
                            overdue ? "border-rose-200 bg-rose-50/40" : "border-dark-primary/8"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-dark-primary">{r.type}</p>
                                {overdue ? (
                                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-800">
                                    Overdue
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-mid-green">
                                Due {formatTelemarketingInstant(r.dueAt, { withTime: true })}
                              </p>
                              <p className="mt-1 break-words text-mid-green">{r.notes}</p>
                            </div>
                            {r.status === "PENDING" ? (
                              <button
                                type="button"
                                onClick={() => completeReminder(r.id)}
                                className="text-xs text-mid-green underline"
                              >
                                Done
                              </button>
                            ) : (
                              <span className="text-xs text-mid-green">{r.status}</span>
                            )}
                          </div>
                        </li>
                      );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              {tab === "timeline" ? (
                <div className="space-y-3 rounded-xl bg-background p-4">
                  <div className="rounded-lg border border-dark-primary/10 bg-white p-3">
                    <label className="text-[11px] font-medium text-mid-green">Add note</label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-dark-primary/10 px-2 py-1.5 text-sm"
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Write an internal note…"
                    />
                    <button
                      type="button"
                      disabled={!noteDraft.trim() || noteSaving}
                      onClick={() => void addNote()}
                      className="mt-2 rounded-md bg-dark-secondary px-3 py-1 text-xs text-background disabled:opacity-50"
                    >
                      {noteSaving ? "Saving…" : "Save note"}
                    </button>
                  </div>
                  <TelemarketingTimelineList events={contact.timeline} />
                </div>
              ) : null}

              {tab === "linked" ? (
                <div className="space-y-3 rounded-xl bg-background p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-dark-primary">Linked contacts</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkFormOpen(true);
                        setLinkError("");
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-dark-secondary px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-primary"
                    >
                      <Plus className="h-3.5 w-3.5" /> Link new contact
                    </button>
                  </div>

                  {linkFormOpen ? (
                    <div className="space-y-2 rounded-lg border border-dark-primary/10 bg-white p-3">
                      <p className="text-xs font-semibold text-dark-primary">New linked contact</p>
                      {linkError ? <p className="text-xs text-rose-600">{linkError}</p> : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-md border border-dark-primary/10 px-2 py-1.5 text-xs outline-none focus:border-mid-green/40"
                          placeholder="Name"
                          value={linkDraft.name}
                          onChange={(e) => setLinkDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <input
                          className="rounded-md border border-dark-primary/10 px-2 py-1.5 text-xs outline-none focus:border-mid-green/40"
                          placeholder="Role"
                          value={linkDraft.role}
                          onChange={(e) => setLinkDraft((d) => ({ ...d, role: e.target.value }))}
                        />
                        <input
                          className="rounded-md border border-dark-primary/10 px-2 py-1.5 text-xs outline-none focus:border-mid-green/40"
                          placeholder="Phone *"
                          value={linkDraft.phone}
                          onChange={(e) => setLinkDraft((d) => ({ ...d, phone: e.target.value }))}
                        />
                        <input
                          className="rounded-md border border-dark-primary/10 px-2 py-1.5 text-xs outline-none focus:border-mid-green/40"
                          placeholder="Email *"
                          value={linkDraft.email}
                          onChange={(e) => setLinkDraft((d) => ({ ...d, email: e.target.value }))}
                        />
                      </div>
                      <p className="text-[10px] text-mid-green">Phone or email is required.</p>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-md px-3 py-1.5 text-xs text-mid-green hover:bg-dark-secondary/8"
                          onClick={() => {
                            setLinkFormOpen(false);
                            setLinkError("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={linkSaving}
                          onClick={() => void submitLinkedContact()}
                          className="rounded-md bg-dark-secondary px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                        >
                          {linkSaving ? "Saving…" : "Save linked contact"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {contact.convertedLead ? (
                    <div className="rounded-lg border border-dark-primary/10 bg-white p-3">
                      <p className="text-xs font-semibold uppercase text-mid-green">Lead</p>
                      <Link
                        href={`/leads/${contact.convertedLead.id}`}
                        className="text-mid-green underline"
                      >
                        {contact.convertedLead.leadNumber}
                      </Link>
                    </div>
                  ) : null}

                  {contact.alternatives.length === 0 && !contact.convertedLead && !linkFormOpen ? (
                    <div className="flex flex-col items-center py-10 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-light-green/30 text-mid-green">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-dark-primary">No linked contacts</p>
                      <p className="mt-1 text-xs text-mid-green">
                        No alternative contacts have been added.
                      </p>
                      <button
                        type="button"
                        onClick={() => setLinkFormOpen(true)}
                        className="mt-4 inline-flex items-center gap-1 rounded-md border border-dark-primary/15 bg-white px-3 py-2 text-xs font-medium text-dark-primary hover:bg-light-green/20"
                      >
                        <Plus className="h-3.5 w-3.5" /> Link new contact
                      </button>
                    </div>
                  ) : null}

                  {contact.alternatives.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-dark-primary/10 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white text-mid-green">
                          <tr>
                            <th className="px-3 py-2">Relation</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Phone</th>
                            <th className="px-3 py-2">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contact.alternatives.map((a) => (
                            <tr key={a.id} className="border-t border-dark-primary/6">
                              <td className="px-3 py-2">Alternative</td>
                              <td className="px-3 py-2">{a.name || "—"}</td>
                              <td className="px-3 py-2">{a.phone || "—"}</td>
                              <td className="px-3 py-2">{a.email || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-dark-primary/8 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setReminderOpen(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dark-primary/15 bg-white px-3 py-2.5 text-sm font-medium text-dark-primary hover:bg-background"
              >
                <Plus className="h-4 w-4" />
                Reminder
              </button>
            </div>
          </>
        )}

        {logOpen ? (
          <Modal onClose={() => setLogOpen(false)} title="Log a call">
            <p className="text-sm text-mid-green">Outcome for {contact?.name || "contact"}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-mid-green">
                Call status
                <select
                  className="mt-1 w-full rounded-lg border border-dark-primary/10 px-3 py-2 text-sm"
                  value={logStatus}
                  onChange={(e) =>
                    setLogStatus(e.target.value as (typeof LOG_CALL_STATUSES)[number])
                  }
                >
                  {LOG_CALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TELEMARKETING_CALL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-mid-green">
                Call update *
                <textarea
                  className="mt-1 w-full rounded-lg border border-dark-primary/10 px-3 py-2 text-sm"
                  rows={3}
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
              </label>
              <label className="block text-xs text-mid-green">
                Next follow-up
                <div className="mt-1">
                  <DateTimePicker value={logFollowUp} onChange={setLogFollowUp} />
                </div>
              </label>
            </div>
            <div className="mt-4 flex flex-col items-end gap-1">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setLogOpen(false)} className="rounded-full px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={logSubmitDisabled}
                  onClick={() => void submitLogCall()}
                  className="rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  {saving ? "Logging…" : "Log call"}
                </button>
              </div>
              {logDisabledReason ? (
                <p className="text-xs text-mid-green">{logDisabledReason}</p>
              ) : null}
              {logError ? <p className="text-sm text-rose-600">{logError}</p> : null}
            </div>
          </Modal>
        ) : null}

        {callbackOpen ? (
          <CallbackDueModal
            open
            contactLabel={contact?.name || contact?.company || "Contact"}
            onClose={() => setCallbackOpen(false)}
            onConfirm={async (dueAtIso) => {
              await patchStatus("CALL_BACK_REQUESTED", dueAtIso);
              setCallbackOpen(false);
            }}
          />
        ) : null}

        <ConfirmModal
          open={leadConfirmOpen}
          title="Move to lead?"
          description={`Create a lead from ${contact?.name?.trim() || contact?.company?.trim() || "this contact"}? This moves them into Leads.`}
          confirmLabel="Move to lead"
          busy={leadConfirmBusy}
          onClose={() => {
            if (!leadConfirmBusy) setLeadConfirmOpen(false);
          }}
          onConfirm={confirmMoveToLead}
        />

        {reminderOpen ? (
          <Modal onClose={() => setReminderOpen(false)} title="Add reminder">
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-mid-green">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-dark-primary/10 px-3 py-2 text-sm"
                  value={reminderType}
                  onChange={(e) =>
                    setReminderType(e.target.value as (typeof REMINDER_TYPES)[number]["value"])
                  }
                >
                  {REMINDER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-mid-green">
                Due date *
                <div className="mt-1">
                  <DateTimePicker value={reminderDue} onChange={setReminderDue} />
                </div>
              </label>
              <label className="block text-xs text-mid-green">
                Reminder *
                <textarea
                  className="mt-1 w-full rounded-lg border border-dark-primary/10 px-3 py-2 text-sm"
                  rows={3}
                  value={reminderNotes}
                  onChange={(e) => setReminderNotes(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col items-end gap-1">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setReminderOpen(false)} className="rounded-full px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reminderSubmitDisabled}
                  onClick={() => void submitReminder()}
                  className="rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  Create reminder
                </button>
              </div>
              {reminderDisabledReason ? (
                <p className="text-xs text-mid-green">{reminderDisabledReason}</p>
              ) : null}
            </div>
          </Modal>
        ) : null}
      </aside>
    </div>
  );
}


function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-2 sm:px-3 first:pl-0 last:pr-0">
      <p className="text-[10px] font-medium text-mid-green">{label}</p>
      <div className="mt-1 text-sm text-dark-primary">{children}</div>
    </div>
  );
}

function CompactDetail({
  icon,
  value,
  placeholder,
  editing,
  draft,
  error,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  icon: React.ReactNode;
  value: string;
  placeholder: string;
  editing: boolean;
  draft: string;
  error?: string;
  onStart: () => void;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const shown = value.trim() || placeholder;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-mid-green">{icon}</span>
      {editing ? (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded border border-mid-green/30 bg-white px-1.5 py-0.5 text-xs outline-none"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onSave}
        />
      ) : (
        <button
          type="button"
          className={`flex min-w-0 flex-1 items-center gap-1 text-left text-xs ${value.trim() ? "font-medium text-dark-primary" : "text-mid-green/70"}`}
          onClick={onStart}
        >
          <span className="truncate">{shown}</span>
          <Pencil className="h-3 w-3 shrink-0 opacity-40" />
        </button>
      )}
      </div>
      {error ? <p className="pl-6 text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}

function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-semibold text-dark-primary">{title}</p>
      <p className="mt-1 text-xs text-mid-green">{hint}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-dark-primary/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-primary">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-mid-green hover:bg-dark-secondary/8">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
