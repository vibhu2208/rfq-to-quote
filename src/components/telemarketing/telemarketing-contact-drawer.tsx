"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Mail,
  Phone,
  Pencil,
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
  const [editField, setEditField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/telemarketing/contacts/${contactId}`);
      const data = await res.json();
      setContact(data.contact || null);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  async function patchStatus(callStatus: TelemarketingCallStatus) {
    await patch({ callStatus });
  }

  async function moveToLead() {
    if (!window.confirm("Move this contact to Leads?")) return;
    await patch({ moveToLead: true });
  }

  async function saveField(field: string, value: string) {
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
    if (!noteDraft.trim()) return;
    await patch({ note: noteDraft.trim() });
    setNoteDraft("");
  }

  async function submitLogCall() {
    if (!logNote.trim()) return;
    setSaving(true);
    try {
      const followUpAt = parseLocalDateTimeValue(logFollowUp);
      await fetch(`/api/telemarketing/contacts/${contactId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: logStatus,
          note: logNote.trim(),
          followUpAt: followUpAt ? followUpAt.toISOString() : null,
        }),
      });
      setLogOpen(false);
      setLogNote("");
      setLogFollowUp("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "calls", label: "Calls" },
    { id: "reminders", label: "Reminders" },
    { id: "timeline", label: "Timeline" },
    { id: "linked", label: "Linked" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-dark-primary/35"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-[42rem] flex-col bg-[#faf9f6] shadow-[-12px_0_40px_rgba(11,43,38,0.18)]">
        <div className="border-b border-dark-primary/10 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-md border border-dark-primary/10 bg-white px-2.5 py-1 text-sm font-medium text-dark-primary">
                {contact?.phone?.trim() || "No phone"}
              </span>
              <p className="mt-2 text-[11px] text-mid-green">
                Added {contact ? format(new Date(contact.createdAt), "d MMM yyyy") : "…"}
                {contact ? (
                  <>
                    {" "}
                    | Last updated {format(new Date(contact.updatedAt), "d MMM yyyy, h:mm a")}
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-mid-green/70 hover:bg-dark-secondary/8"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading || !contact ? (
          <div className="px-5 py-8 text-sm text-mid-green">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-dark-primary/10 bg-[#f3f0e8] px-5 py-3 text-xs sm:grid-cols-4">
              <SummaryItem label="Source" value={contact.source} />
              <SummaryItem
                label="Status"
                value={
                  <CallStatusDropdown
                    status={contact.callStatus}
                    onChange={patchStatus}
                    onMoveToLead={moveToLead}
                  />
                }
              />
              <SummaryItem
                label="Assigned to"
                value={
                  <select
                    className="mt-0.5 w-full rounded-md border border-dark-primary/10 bg-white px-2 py-1 text-xs"
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
                }
              />
              <SummaryItem
                label="Tags"
                value={
                  <div>
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.length ? (
                        contact.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="rounded bg-white px-1.5 py-0.5 text-[10px] text-dark-primary"
                            onClick={() => removeTag(t)}
                            title="Remove tag"
                          >
                            {t} ×
                          </button>
                        ))
                      ) : (
                        <span className="text-mid-green">No tags</span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <input
                        className="min-w-0 flex-1 rounded border border-dark-primary/10 bg-white px-1.5 py-0.5 text-[10px]"
                        placeholder="Add tag"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void addTag();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void addTag()}
                        className="rounded bg-[#2f4a2b] px-1.5 text-[10px] text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                }
              />
            </div>

            <div className="border-b border-dark-primary/10 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-mid-green">
                Contact details
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <DetailField
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Name"
                  value={contact.name}
                  placeholder="No contact name"
                  editing={editField === "name"}
                  draft={fieldDraft}
                  onStart={() => {
                    setEditField("name");
                    setFieldDraft(contact.name);
                  }}
                  onDraft={setFieldDraft}
                  onSave={() => void saveField("name", fieldDraft)}
                  onCancel={() => setEditField(null)}
                />
                <DetailField
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  label="Company"
                  value={contact.company}
                  placeholder="No company name"
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
                <DetailField
                  icon={<UserCircle className="h-3.5 w-3.5" />}
                  label="Role"
                  value={contact.role}
                  placeholder="No role"
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
                <DetailField
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={contact.phone}
                  placeholder="No phone"
                  editing={editField === "phone"}
                  draft={fieldDraft}
                  onStart={() => {
                    setEditField("phone");
                    setFieldDraft(contact.phone);
                  }}
                  onDraft={setFieldDraft}
                  onSave={() => void saveField("phone", fieldDraft)}
                  onCancel={() => setEditField(null)}
                />
                <DetailField
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={contact.email}
                  placeholder="No email address"
                  editing={editField === "email"}
                  draft={fieldDraft}
                  onStart={() => {
                    setEditField("email");
                    setFieldDraft(contact.email);
                  }}
                  onDraft={setFieldDraft}
                  onSave={() => void saveField("email", fieldDraft)}
                  onCancel={() => setEditField(null)}
                />
              </div>
            </div>

            <div className="flex gap-0.5 border-b border-dark-primary/10 bg-white px-5 pt-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 rounded-t-md px-2 py-2 text-sm ${
                    tab === t.id
                      ? "bg-[#f3f0e8] font-semibold text-dark-primary"
                      : "text-mid-green hover:text-dark-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === "calls" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-dark-primary">Calls</h3>
                    <button
                      type="button"
                      onClick={() => setLogOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#2f4a2b] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      <Phone className="h-3.5 w-3.5" /> Log
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
                        <thead className="bg-[#faf9f6] text-[10px] uppercase text-mid-green">
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
                                <p className="mt-1 text-xs text-mid-green">{c.note}</p>
                              </td>
                              <td className="px-3 py-2 text-xs text-mid-green">
                                {format(new Date(c.createdAt), "d MMM yyyy, h:mm a")}
                              </td>
                              <td className="px-3 py-2 text-xs text-mid-green">
                                {c.followUpAt
                                  ? format(new Date(c.followUpAt), "d MMM yyyy, h:mm a")
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-dark-primary">Reminders</h3>
                    <button
                      type="button"
                      onClick={() => setReminderOpen(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#2f4a2b] px-3 py-1.5 text-xs font-medium text-white"
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
                      {contact.reminders.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-lg border border-dark-primary/8 bg-white p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-dark-primary">{r.type}</p>
                              <p className="text-xs text-mid-green">
                                Due {format(new Date(r.dueAt), "d MMM yyyy, h:mm a")}
                              </p>
                              <p className="mt-1 text-mid-green">{r.notes}</p>
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
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {tab === "timeline" ? (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-dark-primary">Timeline</h3>
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
                      disabled={!noteDraft.trim()}
                      onClick={() => void addNote()}
                      className="mt-2 rounded-md bg-[#2f4a2b] px-3 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Save note
                    </button>
                  </div>
                  <TelemarketingTimelineList events={contact.timeline} />
                </div>
              ) : null}

              {tab === "linked" ? (
                <div className="space-y-4 text-sm">
                  <h3 className="text-lg font-semibold text-dark-primary">Linked contacts</h3>
                  <>
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
                      {contact.alternatives.length === 0 && !contact.convertedLead ? (
                        <EmptyBlock
                          title="No linked contacts"
                          hint="No alternative contacts have been added."
                        />
                      ) : null}
                      {contact.alternatives.length > 0 ? (
                        <table className="w-full overflow-hidden rounded-lg border border-dark-primary/10 bg-white text-left text-xs">
                          <thead className="bg-[#faf9f6] text-mid-green">
                            <tr>
                              <th className="px-2 py-2">Relation</th>
                              <th className="px-2 py-2">Name</th>
                              <th className="px-2 py-2">Phone</th>
                              <th className="px-2 py-2">Email</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contact.alternatives.map((a) => (
                              <tr key={a.id} className="border-t border-dark-primary/6">
                                <td className="px-2 py-2">Alternative</td>
                                <td className="px-2 py-2">{a.name || "—"}</td>
                                <td className="px-2 py-2">{a.phone || "—"}</td>
                                <td className="px-2 py-2">{a.email || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                  </>
                </div>
              ) : null}
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
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLogOpen(false)} className="rounded-full px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                disabled={!logNote.trim() || saving}
                onClick={() => void submitLogCall()}
                className="rounded-md bg-[#2f4a2b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Log call
              </button>
            </div>
          </Modal>
        ) : null}

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
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReminderOpen(false)} className="rounded-full px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                disabled={!reminderNotes.trim() || saving}
                onClick={() => void submitReminder()}
                className="rounded-md bg-[#2f4a2b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create reminder
              </button>
            </div>
          </Modal>
        ) : null}
      </aside>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-mid-green">{label}</p>
      <div className="mt-1 text-xs text-dark-primary">{value}</div>
    </div>
  );
}

function DetailField({
  icon,
  label,
  value,
  placeholder,
  editing,
  draft,
  onStart,
  onDraft,
  onSave,
  onCancel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  editing: boolean;
  draft: string;
  onStart: () => void;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const shown = value.trim() || placeholder;
  return (
    <div className="flex items-start gap-2 rounded-md border border-dark-primary/8 bg-white px-2 py-2">
      <span className="mt-0.5 text-mid-green">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase text-mid-green">{label}</p>
        {editing ? (
          <input
            autoFocus
            className="mt-0.5 w-full rounded border border-mid-green/30 px-1.5 py-0.5 text-xs"
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
            className={`mt-0.5 flex w-full items-center gap-1 text-left text-xs ${value.trim() ? "text-dark-primary" : "text-mid-green/70"}`}
            onClick={onStart}
          >
            <span className="truncate">{shown}</span>
            <Pencil className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-semibold text-dark-primary">{title}</p>
      <p className="mt-1 text-xs text-mid-green">{hint}</p>
    </div>
  );
}

function LinkedSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-16 rounded-lg bg-dark-secondary/10" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 rounded-lg bg-dark-secondary/10" />
        <div className="h-12 rounded-lg bg-dark-secondary/10" />
        <div className="h-12 rounded-lg bg-dark-secondary/10" />
      </div>
      <div className="h-24 rounded-lg bg-dark-secondary/10" />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-dark-primary/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-dark-primary">{title}</h3>
        {children}
      </div>
    </div>
  );
}