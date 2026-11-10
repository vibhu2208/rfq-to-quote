"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import type { LeadStage } from "@prisma/client";
import { LeadStageProcess } from "@/components/leads/lead-stage-process";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_INTAKE_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_LABELS,
} from "@/lib/leads/constants";

type LeadDetail = {
  id: string;
  leadNumber: string;
  channel: string;
  subject: string;
  rawText: string;
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
  category: string;
  parsedCategory: string | null;
  leadStage: string;
  priority: string;
  intakeKind: "REQUIREMENT" | "JUNK" | "SKIPPED";
  junkReason: string;
  stageDetail: string;
  expectedValue: string | number | null;
  expectedClosureAt: string | null;
  nextFollowUpAt: string | null;
  slaDueAt: string | null;
  referralSource: string;
  disqualifyReason: string;
  lostReason: string;
  createdAt: string;
  assignedTo: { id: string; name: string; email: string } | null;
  party: {
    id: string;
    legalName: string;
    gstin: string | null;
    email: string | null;
    phone: string | null;
    addresses: {
      type: string;
      addressLine1: string;
      city: string;
      state: string;
      postalCode: string;
    }[];
    contacts: { name: string; email: string; phone: string; isPrimary: boolean }[];
  } | null;
  quotes: {
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: string | number;
    version: number;
    createdAt: string;
    needsAssistance?: boolean;
    assistanceReason?: string;
    lastBuyerReplyAt?: string | null;
    lastReplyIntent?: string | null;
    lastAnalysisSummary?: string;
    messages?: {
      id: string;
      subject: string;
      body: string;
      intent: string | null;
      analysis: unknown;
      createdAt: string;
      fromEmail: string;
    }[];
    proformaInvoices: {
      id: string;
      number: string;
      status: string;
      total: string | number;
    }[];
  }[];
  invoices: {
    id: string;
    number: string;
    status: string;
    total: string | number;
    createdAt: string;
  }[];
  activities: {
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }[];
  followUps: {
    id: string;
    type: string;
    status: string;
    dueAt: string;
    title: string;
    notes: string;
  }[];
  stageHistory: {
    id: string;
    fromStage: string | null;
    toStage: string;
    reason: string;
    createdAt: string;
    actor: { name: string } | null;
  }[];
  messages: { id: string; direction: string; body: string; createdAt: string }[];
};

type User = { id: string; name: string; email: string };

function money(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [followTitle, setFollowTitle] = useState("");
  const [followDue, setFollowDue] = useState("");
  const [followType, setFollowType] = useState("CALL");
  const [stageReason, setStageReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRes, usersRes] = await Promise.all([
        fetch(`/api/leads/${id}`),
        fetch("/api/leads/users"),
      ]);
      if (leadRes.status === 404) {
        setLead(null);
        return;
      }
      setLead(await leadRes.json());
      const u = await usersRes.json();
      setUsers(Array.isArray(u.items) ? u.items : []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Save failed");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(toStage: string) {
    const needsReason = toStage === "DISQUALIFIED" || toStage === "DEAL_LOST";
    const reason =
      needsReason
        ? stageReason.trim() ||
          window.prompt("Reason (required):") ||
          ""
        : stageReason.trim();
    if (needsReason && !reason) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Stage change failed");
        return;
      }
      setStageReason("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    await fetch(`/api/leads/${id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: note.trim() }),
    });
    setNote("");
    await load();
  }

  async function scheduleFollowUp() {
    if (!followDue) return;
    await fetch(`/api/leads/${id}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: followType,
        dueAt: new Date(followDue).toISOString(),
        title: followTitle,
      }),
    });
    setFollowTitle("");
    setFollowDue("");
    await load();
  }

  async function createQuote() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rfqs/${id}/convert-quote`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Could not create quote");
        return;
      }
      if (data.id) router.push(`/quotes/${data.id}`);
      else await load();
    } finally {
      setSaving(false);
    }
  }

  async function promoteFromJunk() {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Could not promote");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-4 text-sm text-mid-green">Loading lead…</p>;
  }
  if (!lead) {
    return <p className="p-4 text-sm text-mid-green">Lead not found.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-dark-primary">
              {lead.customerCompany || lead.customerName || "Lead"}
            </h1>
            <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-xs">
              {lead.leadNumber}
            </span>
            <span className="rounded-full bg-mid-green/15 px-2 py-0.5 text-xs text-mid-green">
              {LEAD_STAGE_LABELS[lead.leadStage as keyof typeof LEAD_STAGE_LABELS]}
            </span>
            {lead.intakeKind && lead.intakeKind !== "REQUIREMENT" ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  lead.intakeKind === "JUNK"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {LEAD_INTAKE_LABELS[lead.intakeKind]}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-mid-green">
            {LEAD_CHANNEL_LABELS[lead.channel as keyof typeof LEAD_CHANNEL_LABELS] ||
              lead.channel}
            {" · "}
            created {formatDistanceToNowStrict(new Date(lead.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/rfq/${lead.id}`}
            className="rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
          >
            Open RFQ workspace
          </Link>
          {lead.customerPhone ? (
            <a
              href={`tel:${lead.customerPhone}`}
              className="rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
            >
              Call
            </a>
          ) : null}
          {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void promoteFromJunk()}
              className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Promote to lead
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void createQuote()}
              className="rounded-full bg-mid-green px-3 py-1.5 text-sm font-medium text-white"
            >
              Create quotation
            </button>
          )}
        </div>
      </div>

      {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">
            Stored as {LEAD_INTAKE_LABELS[lead.intakeKind].toLowerCase()} for
            review
          </p>
          <p className="mt-0.5 text-amber-800/90">
            {lead.junkReason ||
              lead.disqualifyReason ||
              "Classifier did not treat this as a product requirement."}{" "}
            Promote if it is a real enquiry.
          </p>
        </div>
      ) : null}

      {(() => {
        const negotiationQuotes = lead.quotes.filter(
          (q) =>
            q.status === "UNDER_NEGOTIATION" ||
            q.status === "REVISED" ||
            q.needsAssistance ||
            Boolean(q.lastBuyerReplyAt) ||
            (q.messages && q.messages.length > 0)
        );
        if (
          lead.leadStage !== "NEGOTIATION" &&
          negotiationQuotes.length === 0
        ) {
          return null;
        }
        const quotes =
          negotiationQuotes.length > 0 ? negotiationQuotes : lead.quotes;
        return (
          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-dark-primary">
                  Negotiation
                </h2>
                <p className="mt-0.5 text-xs text-mid-green">
                  Buyer replies and quote thread for this lead
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {quotes.length === 0 ? (
                <p className="text-sm text-mid-green">
                  Lead is in Negotiation, but no quotation thread is linked yet.
                </p>
              ) : (
                quotes.map((q) => {
                  const latestIn = q.messages?.[0];
                  const analysis =
                    latestIn?.analysis &&
                    typeof latestIn.analysis === "object"
                      ? (latestIn.analysis as {
                          summary?: string;
                          counterPrice?: number | null;
                        })
                      : null;
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-amber-200/70 bg-white/80 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/quotes/${q.id}`}
                            className="text-sm font-semibold text-dark-primary hover:underline"
                          >
                            {q.quoteNumber}
                          </Link>
                          <span className="rounded-full bg-dark-secondary/10 px-2 py-0.5 text-[11px] font-medium text-dark-primary">
                            {q.status.replaceAll("_", " ")}
                          </span>
                          {q.needsAssistance ? (
                            <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-medium text-amber-950">
                              Needs reply
                            </span>
                          ) : null}
                          {q.lastReplyIntent ? (
                            <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px] text-mid-green">
                              {q.lastReplyIntent.replaceAll("_", " ").toLowerCase()}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-sm font-medium text-dark-primary">
                          {money(q.grandTotal)}
                        </span>
                      </div>

                      {q.needsAssistance || q.assistanceReason || q.lastAnalysisSummary ? (
                        <p className="mt-2 text-sm text-amber-950/90">
                          {q.assistanceReason ||
                            q.lastAnalysisSummary ||
                            "Buyer reply needs a commercial decision."}
                        </p>
                      ) : null}

                      {latestIn ? (
                        <div className="mt-3 rounded-lg bg-dark-secondary/[0.04] px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-mid-green">
                            <span>
                              Latest buyer reply
                              {latestIn.fromEmail ? ` · ${latestIn.fromEmail}` : ""}
                            </span>
                            <span>
                              {formatDistanceToNowStrict(new Date(latestIn.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-dark-primary whitespace-pre-wrap line-clamp-4">
                            {latestIn.body.trim() || latestIn.subject || "—"}
                          </p>
                          {analysis?.counterPrice != null &&
                          Number.isFinite(analysis.counterPrice) ? (
                            <p className="mt-1 text-xs font-medium text-mid-green">
                              Counter: {money(analysis.counterPrice)}
                            </p>
                          ) : null}
                        </div>
                      ) : q.lastBuyerReplyAt ? (
                        <p className="mt-2 text-xs text-mid-green">
                          Last buyer reply{" "}
                          {formatDistanceToNowStrict(new Date(q.lastBuyerReplyAt), {
                            addSuffix: true,
                          })}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-mid-green">
                          No buyer reply captured on this quote yet.
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="rounded-full bg-mid-green px-3 py-1.5 text-xs font-medium text-background hover:bg-dark-secondary"
                        >
                          Open quote &amp; reply
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })()}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Customer / Company profile</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-mid-green">
                Company
                <input
                  defaultValue={lead.customerCompany}
                  onBlur={(e) => {
                    if (e.target.value !== lead.customerCompany) {
                      void patch({ customerCompany: e.target.value });
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                />
              </label>
              <label className="text-xs text-mid-green">
                Contact person
                <input
                  defaultValue={lead.customerName}
                  onBlur={(e) => {
                    if (e.target.value !== lead.customerName) {
                      void patch({ customerName: e.target.value });
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                />
              </label>
              <label className="text-xs text-mid-green">
                Email
                <input
                  defaultValue={lead.customerEmail}
                  onBlur={(e) => {
                    if (e.target.value !== lead.customerEmail) {
                      void patch({ customerEmail: e.target.value });
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                />
              </label>
              <label className="text-xs text-mid-green">
                Phone
                <input
                  defaultValue={lead.customerPhone}
                  onBlur={(e) => {
                    if (e.target.value !== lead.customerPhone) {
                      void patch({ customerPhone: e.target.value });
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                />
              </label>
            </div>
            {lead.party ? (
              <div className="mt-3 rounded-xl bg-dark-secondary/[0.04] p-3 text-xs">
                <p className="font-medium">
                  Linked party: {lead.party.legalName}
                  {lead.party.gstin ? ` · GSTIN ${lead.party.gstin}` : ""}
                </p>
                {lead.party.addresses[0] ? (
                  <p className="mt-1 text-mid-green">
                    {lead.party.addresses[0].addressLine1},{" "}
                    {lead.party.addresses[0].city}, {lead.party.addresses[0].state}{" "}
                    {lead.party.addresses[0].postalCode}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <LeadStageProcess
              stage={lead.leadStage as LeadStage}
              reasonDraft={stageReason}
              onReasonChange={setStageReason}
              onChangeStage={(to) => void changeStage(to)}
              disabled={saving}
            />
          </section>

          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Sales information</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-mid-green">
                Priority
                <select
                  value={lead.priority}
                  onChange={(e) => void patch({ priority: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                >
                  {LEAD_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {LEAD_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-mid-green">
                Assigned to
                <select
                  value={lead.assignedTo?.id || ""}
                  onChange={(e) =>
                    void patch({
                      assignedToUserId: e.target.value || null,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-mid-green">
                Category
                <input
                  defaultValue={lead.category || lead.parsedCategory || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (lead.category || "")) {
                      void patch({ category: e.target.value });
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                />
              </label>
              <label className="text-xs text-mid-green">
                Expected value
                <input
                  type="number"
                  defaultValue={
                    lead.expectedValue != null ? String(lead.expectedValue) : ""
                  }
                  onBlur={(e) => {
                    const n = e.target.value === "" ? null : Number(e.target.value);
                    void patch({ expectedValue: n });
                  }}
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                />
              </label>
              <label className="text-xs text-mid-green">
                Expected closure
                <input
                  type="date"
                  defaultValue={
                    lead.expectedClosureAt
                      ? lead.expectedClosureAt.slice(0, 10)
                      : ""
                  }
                  onChange={(e) =>
                    void patch({
                      expectedClosureAt: e.target.value || null,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                />
              </label>
              <label className="text-xs text-mid-green sm:col-span-2">
                Requirement
                <textarea
                  defaultValue={lead.rawText}
                  rows={4}
                  onBlur={(e) => {
                    if (e.target.value !== lead.rawText) {
                      void patch({ rawText: e.target.value });
                    }
                  }}
                  className="mt-1 w-full rounded-lg bg-dark-secondary/[0.05] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Related documents</h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-dark-secondary/[0.04] p-3 text-sm">
                <p className="font-medium">Original enquiry</p>
                <p className="mt-1 text-xs text-mid-green line-clamp-4">
                  {lead.subject || lead.rawText || "—"}
                </p>
              </div>
              {lead.quotes.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-xl border border-dark-primary/8 px-3 py-2 text-sm"
                >
                  <div>
                    <Link href={`/quotes/${q.id}`} className="font-medium hover:underline">
                      {q.quoteNumber}
                    </Link>
                    <p className="text-xs text-mid-green">
                      {q.status.replaceAll("_", " ")} · v{q.version} ·{" "}
                      {money(q.grandTotal)}
                      {q.needsAssistance ? " · needs reply" : ""}
                    </p>
                    {q.lastReplyIntent || q.lastAnalysisSummary ? (
                      <p className="mt-0.5 text-xs text-amber-900/80 line-clamp-2">
                        {q.lastReplyIntent
                          ? `${q.lastReplyIntent.replaceAll("_", " ").toLowerCase()}`
                          : ""}
                        {q.lastReplyIntent && q.lastAnalysisSummary ? " · " : ""}
                        {q.lastAnalysisSummary || ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-xs text-mid-green">
                    {q.proformaInvoices.map((p) => (
                      <Link
                        key={p.id}
                        href={`/proformas/${p.id}`}
                        className="mr-2 hover:underline"
                      >
                        PI {p.number}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {lead.invoices?.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-xl border border-dark-primary/8 px-3 py-2 text-sm"
                >
                  <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                    Invoice {inv.number}
                  </Link>
                  <span className="text-xs text-mid-green">
                    {inv.status} · {money(inv.total)}
                  </span>
                </div>
              ))}
              {!lead.quotes.length ? (
                <p className="text-sm text-mid-green">No quotations yet.</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Schedule follow-up</h2>
            <div className="mt-3 space-y-2">
              <select
                value={followType}
                onChange={(e) => setFollowType(e.target.value)}
                className="h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
              >
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Meeting</option>
                <option value="TASK">Task</option>
              </select>
              <input
                type="datetime-local"
                value={followDue}
                onChange={(e) => setFollowDue(e.target.value)}
                className="h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
              />
              <input
                value={followTitle}
                onChange={(e) => setFollowTitle(e.target.value)}
                placeholder="Title / notes"
                className="h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void scheduleFollowUp()}
                className="rounded-full bg-dark-primary px-3 py-1.5 text-sm text-background"
              >
                Schedule
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {lead.followUps.map((f) => (
                <div key={f.id} className="rounded-lg bg-dark-secondary/[0.04] px-3 py-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {f.type} · {f.status}
                    </span>
                    <span>{format(new Date(f.dueAt), "dd MMM HH:mm")}</span>
                  </div>
                  <p className="mt-1 text-mid-green">{f.title || f.notes}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Activity timeline</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…"
                className="h-9 flex-1 rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => void addNote()}
                className="rounded-full bg-dark-secondary/10 px-3 text-sm"
              >
                Add
              </button>
            </div>
            <ol className="mt-4 space-y-3">
              {lead.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-mid-green/30 pl-3 text-xs">
                  <p className="font-medium text-dark-primary">
                    {a.title || a.type}
                  </p>
                  {a.body ? (
                    <p className="mt-0.5 text-mid-green">{a.body}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-mid-green/80">
                    {formatDistanceToNowStrict(new Date(a.createdAt), {
                      addSuffix: true,
                    })}
                    {a.actor ? ` · ${a.actor.name || a.actor.email}` : ""}
                  </p>
                </li>
              ))}
              {!lead.activities.length ? (
                <p className="text-sm text-mid-green">No activity yet.</p>
              ) : null}
            </ol>
          </section>

          <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
            <h2 className="text-sm font-semibold">Stage history</h2>
            <ol className="mt-3 space-y-2 text-xs">
              {lead.stageHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span>
                    {h.fromStage
                      ? LEAD_STAGE_LABELS[
                          h.fromStage as keyof typeof LEAD_STAGE_LABELS
                        ]
                      : "—"}
                    {" → "}
                    {LEAD_STAGE_LABELS[h.toStage as keyof typeof LEAD_STAGE_LABELS]}
                    {h.reason ? ` (${h.reason})` : ""}
                  </span>
                  <span className="shrink-0 text-mid-green">
                    {format(new Date(h.createdAt), "dd MMM")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
