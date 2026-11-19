"use client";

import Papa from "papaparse";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock, Plus, Search, Upload, UserRound, X } from "lucide-react";
import { TelemarketingContactDrawer } from "@/components/telemarketing/telemarketing-contact-drawer";
import { CallStatusPill } from "@/components/telemarketing/status-chip";
import {
  TELEMARKETING_CALL_STATUSES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";
import type { TelemarketingCallStatus } from "@prisma/client";

type UserRef = { id: string; name: string; email: string };

type ContactRow = {
  id: string;
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
  source: string;
  callStatus: TelemarketingCallStatus;
  createdAt: string;
  assignedTo: UserRef | null;
  reminders: Array<{ id: string; type: string; dueAt: string; notes: string }>;
};

type DueReminder = {
  id: string;
  type: string;
  dueAt: string;
  notes: string;
  contact: { id: string; name: string; company: string; phone: string };
  assignedTo: UserRef | null;
};

const fieldClass =
  "h-9 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-[13px] text-dark-primary outline-none focus:bg-white focus:ring-1 focus:ring-mid-green/30";

export function TelemarketingWorkbench() {
  const [items, setItems] = useState<ContactRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [dueReminders, setDueReminders] = useState<DueReminder[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [source, setSource] = useState<string>("ALL");
  const [view, setView] = useState<"active" | "archived">("active");
  const [drawerId, setDrawerId] = useState<string | null>(null);
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
    p.set("view", view);
    return p.toString();
  }, [q, status, source, view]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, usersRes] = await Promise.all([
        fetch(`/api/telemarketing/contacts?${queryString}`),
        fetch("/api/leads/users"),
      ]);
      const list = await listRes.json();
      const usersData = await usersRes.json();
      setItems(list.items || []);
      setStatusCounts(list.statusCounts || {});
      setDueReminders(list.dueReminders || []);
      setUsers(usersData.items || []);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patchAssignee(contactId: string, assignedToUserId: string | null) {
    await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToUserId }),
    });
    void refresh();
  }

  async function moveToLead(contactId: string) {
    await fetch(`/api/telemarketing/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveToLead: true }),
    });
    void refresh();
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
    void refresh();
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
    void refresh();
  }

  const statusChips = [
    { key: "ALL", label: "All" },
    ...TELEMARKETING_CALL_STATUSES.map((s) => ({
      key: s,
      label: TELEMARKETING_CALL_STATUS_LABELS[s],
    })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
              className="inline-flex items-center gap-1.5 rounded-full border border-dark-primary/10 px-3 py-2 text-sm text-dark-primary"
            >
              <Upload className="h-4 w-4" /> Import contacts
            </button>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-mid-green px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> New contact
            </button>
          </>
        }
      />

      {dueReminders.length > 0 ? (
        <WorkbenchCard title="Due reminders" accent="amber">
          <ul className="divide-y divide-dark-primary/6 text-sm">
            {dueReminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <button
                  type="button"
                  className="text-left text-dark-primary underline"
                  onClick={() => setDrawerId(r.contact.id)}
                >
                  {r.contact.name || r.contact.company || r.contact.phone} — {r.type}
                </button>
                <span className="text-xs text-mid-green">
                  {format(new Date(r.dueAt), "d MMM, h:mm a")}
                </span>
              </li>
            ))}
          </ul>
        </WorkbenchCard>
      ) : null}

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
          <select
            className={fieldClass}
            value={view}
            onChange={(e) => setView(e.target.value as "active" | "archived")}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className={fieldClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="ALL">All sources</option>
            <option value="IMPORTED">Imported</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {statusChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setStatus(chip.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status === chip.key
                  ? "bg-dark-primary text-white"
                  : "bg-dark-secondary/8 text-mid-green"
              }`}
            >
              {chip.label}
              {statusCounts[chip.key] != null ? ` ${statusCounts[chip.key]}` : ""}
            </button>
          ))}
        </div>
      </WorkbenchCard>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-dark-primary/8 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 bg-dark-secondary/[0.04] text-xs text-mid-green">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Call status</th>
              <th className="px-3 py-2">Assigned to</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-mid-green">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-dark-primary/6 hover:bg-dark-secondary/[0.03]">
                  <td className="px-3 py-2 text-dark-primary">{row.company || "—"}</td>
                  <td className="px-3 py-2">{row.name || "—"}</td>
                  <td className="px-3 py-2">{row.phone || row.email || "—"}</td>
                  <td className="px-3 py-2">
                    <CallStatusPill status={row.callStatus} />
                    {row.reminders?.length ? (
                      <p className="mt-1 text-[10px] text-amber-800">Reminder due</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="max-w-[9rem] rounded-full bg-dark-secondary/[0.06] px-2 py-1 text-xs"
                      value={row.assignedTo?.id || ""}
                      onChange={(e) =>
                        patchAssignee(row.id, e.target.value ? e.target.value : null)
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-mid-green">
                    {format(new Date(row.createdAt), "d MMM yyyy")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Mark as lead"
                        onClick={() => void moveToLead(row.id)}
                        className="rounded p-1 text-mid-green hover:bg-emerald-50"
                      >
                        <UserRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Open timeline"
                        onClick={() => setDrawerId(row.id)}
                        className="rounded p-1 text-mid-green hover:bg-dark-secondary/10"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {drawerId ? (
        <TelemarketingContactDrawer
          contactId={drawerId}
          users={users}
          onClose={() => setDrawerId(null)}
          onChanged={() => void refresh()}
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
              className="rounded-full bg-mid-green px-4 py-2 text-sm font-medium text-white"
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
                    onChange={(e) =>
                      setImportMapping({ ...importMapping, [field]: e.target.value })
                    }
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
              <ModalNav
                onBack={() => setImportStep(1)}
                onNext={() => setImportStep(3)}
                nextLabel="Review"
              />
            </div>
          ) : null}
          {importStep === 3 ? (
            <div className="text-sm">
              <p className="text-mid-green">{importRows.length} rows ready to import.</p>
              <ModalNav
                onBack={() => setImportStep(2)}
                onNext={() => void runImport()}
                nextLabel="Import"
              />
            </div>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}

function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold text-dark-primary">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function WorkbenchCard({
  title,
  children,
  accent,
}: {
  title?: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-dark-primary/8 bg-white p-4 ${
        accent === "amber" ? "border-amber-200/80 bg-amber-50/40" : ""
      }`}
    >
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
        className="rounded-full bg-mid-green px-4 py-2 text-sm font-medium text-white"
      >
        {nextLabel}
      </button>
    </div>
  );
}