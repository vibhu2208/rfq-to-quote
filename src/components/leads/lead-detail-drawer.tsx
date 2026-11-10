"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, Phone, X } from "lucide-react";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_INTAKE_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
} from "@/lib/leads/constants";
import { extractRfqItems } from "@/lib/rfq-items";
import { DateTimePicker } from "@/components/ui/date-time-picker";

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
  parsedSpecs: unknown;
  parseConfidence: number | null;
  parseError: string | null;
  leadStage: string;
  priority: string;
  intakeKind: "REQUIREMENT" | "JUNK" | "SKIPPED";
  junkReason: string;
  expectedValue: string | number | null;
  expectedClosureAt: string | null;
  nextFollowUpAt: string | null;
  disqualifyReason: string;
  createdAt: string;
  assignedTo: { id: string; name: string; email: string } | null;
  quotes: {
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: string | number;
    version: number;
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
  }[];
  activities: {
    id: string;
    type: string;
    title: string;
    body: string;
    createdAt: string;
  }[];
  followUps: {
    id: string;
    type: string;
    status: string;
    dueAt: string;
    title: string;
    notes: string;
  }[];
};

type User = { id: string; name: string; email: string };

type Props = {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

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

export function LeadDetailDrawer({ leadId, open, onClose, onChanged }: Props) {
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [followTitle, setFollowTitle] = useState("");
  const [followDue, setFollowDue] = useState("");
  const [followType, setFollowType] = useState("CALL");
  const [stageReason, setStageReason] = useState("");

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [leadRes, usersRes] = await Promise.all([
        fetch(`/api/leads/${leadId}`),
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
  }, [leadId]);

  useEffect(() => {
    if (!open || !leadId) return;
    void load();
  }, [open, leadId, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  async function patch(body: Record<string, unknown>) {
    if (!leadId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
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
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(toStage: string) {
    if (!leadId || !lead || toStage === lead.leadStage) return;
    const needsReason = toStage === "DISQUALIFIED" || toStage === "DEAL_LOST";
    const reason = needsReason
      ? stageReason.trim() || window.prompt("Reason (required):") || ""
      : stageReason.trim();
    if (needsReason && !reason.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Stage update failed");
        return;
      }
      setStageReason("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function createQuote() {
    if (!leadId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rfqs/${leadId}/convert-quote`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Could not create quote");
        return;
      }
      onChanged?.();
      if (data.id) {
        onClose();
        router.push(`/quotes/${data.id}`);
      } else {
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function promoteFromJunk() {
    if (!leadId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Could not promote");
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!leadId || !note.trim()) return;
    await fetch(`/api/leads/${leadId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: note.trim() }),
    });
    setNote("");
    await load();
    onChanged?.();
  }

  async function scheduleFollowUp() {
    if (!leadId || !followDue) return;
    await fetch(`/api/leads/${leadId}/follow-ups`, {
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
    onChanged?.();
  }

  if (!open) return null;

  const negotiationQuotes =
    lead?.quotes.filter(
      (q) =>
        q.status === "UNDER_NEGOTIATION" ||
        q.status === "REVISED" ||
        q.needsAssistance ||
        Boolean(q.lastBuyerReplyAt) ||
        (q.messages && q.messages.length > 0)
    ) || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-dark-primary/35"
        aria-label="Close lead drawer"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        className="relative flex h-full w-full max-w-xl translate-x-0 flex-col bg-background shadow-[-12px_0_40px_rgba(11,43,38,0.18)] transition-transform duration-200"
      >
        <div className="flex items-start justify-between gap-3 border-b border-dark-primary/8 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-mid-green">
              Lead
            </p>
            <h2
              id="lead-drawer-title"
              className="truncate text-lg font-semibold text-dark-primary"
            >
              {loading && !lead
                ? "Loading…"
                : lead?.customerCompany ||
                  lead?.customerName ||
                  lead?.leadNumber ||
                  "Lead"}
            </h2>
            {lead ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-[11px]">
                  {lead.leadNumber}
                </span>
                <span className="rounded-full bg-mid-green/15 px-2 py-0.5 text-[11px] text-mid-green">
                  {LEAD_STAGE_LABELS[
                    lead.leadStage as keyof typeof LEAD_STAGE_LABELS
                  ] || lead.leadStage}
                </span>
                {lead.intakeKind !== "REQUIREMENT" ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      lead.intakeKind === "JUNK"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {LEAD_INTAKE_LABELS[lead.intakeKind]}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-mid-green hover:bg-dark-secondary/8"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && !lead ? (
            <p className="text-sm text-mid-green">Loading lead…</p>
          ) : !lead ? (
            <p className="text-sm text-mid-green">Lead not found.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void promoteFromJunk()}
                    className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Promote to lead
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void createQuote()}
                    className="rounded-full bg-mid-green px-3 py-1.5 text-sm font-medium text-background disabled:opacity-60"
                  >
                    Create quotation
                  </button>
                )}
                {lead.customerPhone ? (
                  <a
                    href={`tel:${lead.customerPhone}`}
                    className="inline-flex items-center gap-1 rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                ) : null}
                <Link
                  href={`/rfq/${lead.id}`}
                  className="rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
                >
                  RFQ workspace
                </Link>
                <Link
                  href={`/leads/${lead.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
                >
                  Full page
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="font-medium">
                    Stored as {LEAD_INTAKE_LABELS[lead.intakeKind].toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/90">
                    {lead.junkReason ||
                      lead.disqualifyReason ||
                      "Not treated as a product requirement."}
                  </p>
                </div>
              ) : null}

              {(lead.leadStage === "NEGOTIATION" ||
                negotiationQuotes.length > 0) && (
                <section className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3">
                  <h3 className="text-sm font-semibold text-dark-primary">
                    Negotiation
                  </h3>
                  <div className="mt-2 space-y-2">
                    {(negotiationQuotes.length
                      ? negotiationQuotes
                      : lead.quotes
                    ).map((q) => {
                      const latestIn = q.messages?.[0];
                      return (
                        <div
                          key={q.id}
                          className="rounded-lg border border-amber-200/70 bg-white/80 p-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                href={`/quotes/${q.id}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {q.quoteNumber}
                              </Link>
                              <span className="rounded-full bg-dark-secondary/10 px-1.5 py-0.5 text-[10px]">
                                {q.status.replaceAll("_", " ")}
                              </span>
                              {q.needsAssistance ? (
                                <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium">
                                  Needs reply
                                </span>
                              ) : null}
                            </div>
                            <span className="text-xs font-medium">
                              {money(q.grandTotal)}
                            </span>
                          </div>
                          {(q.assistanceReason ||
                            q.lastAnalysisSummary ||
                            q.needsAssistance) && (
                            <p className="mt-1.5 text-xs text-amber-950/90">
                              {q.assistanceReason ||
                                q.lastAnalysisSummary ||
                                "Buyer reply needs a commercial decision."}
                            </p>
                          )}
                          {latestIn ? (
                            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs text-dark-primary">
                              {latestIn.body.trim() || latestIn.subject}
                            </p>
                          ) : null}
                          <Link
                            href={`/quotes/${q.id}`}
                            className="mt-2 inline-flex rounded-full bg-mid-green px-2.5 py-1 text-[11px] font-medium text-background"
                          >
                            Open quote &amp; reply
                          </Link>
                        </div>
                      );
                    })}
                    {lead.quotes.length === 0 ? (
                      <p className="text-xs text-mid-green">
                        No quotation linked yet.
                      </p>
                    ) : null}
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                <h3 className="text-sm font-semibold">Contact</h3>
                <p className="mt-1 text-xs text-mid-green">
                  {LEAD_CHANNEL_LABELS[
                    lead.channel as keyof typeof LEAD_CHANNEL_LABELS
                  ] || lead.channel}
                  {" · "}
                  created{" "}
                  {formatDistanceToNowStrict(new Date(lead.createdAt), {
                    addSuffix: true,
                  })}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-mid-green">
                    Company
                    <input
                      defaultValue={lead.customerCompany}
                      key={`co-${lead.id}-${lead.customerCompany}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerCompany) {
                          void patch({ customerCompany: e.target.value });
                        }
                      }}
                      className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                    />
                  </label>
                  <label className="text-xs text-mid-green">
                    Contact
                    <input
                      defaultValue={lead.customerName}
                      key={`nm-${lead.id}-${lead.customerName}`}
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
                      key={`em-${lead.id}-${lead.customerEmail}`}
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
                      key={`ph-${lead.id}-${lead.customerPhone}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerPhone) {
                          void patch({ customerPhone: e.target.value });
                        }
                      }}
                      className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-mid-green">
                  Requirement
                  <textarea
                    defaultValue={lead.rawText}
                    key={`rq-${lead.id}-${lead.rawText.slice(0, 24)}`}
                    rows={3}
                    onBlur={(e) => {
                      if (e.target.value !== lead.rawText) {
                        void patch({ rawText: e.target.value });
                      }
                    }}
                    className="mt-1 w-full rounded-lg bg-dark-secondary/[0.05] px-3 py-2 text-sm text-dark-primary"
                  />
                </label>
              </section>

              {(() => {
                const rfqItems = extractRfqItems(
                  lead.parsedSpecs,
                  lead.rawText
                );
                const categoryLabel =
                  lead.category || lead.parsedCategory || "";
                const confidence =
                  typeof lead.parseConfidence === "number"
                    ? Math.round(lead.parseConfidence * 100)
                    : null;
                let summary = "";
                if (lead.parsedSpecs && typeof lead.parsedSpecs === "object") {
                  const root = lead.parsedSpecs as Record<string, unknown>;
                  const meta = root._meta;
                  if (meta && typeof meta === "object") {
                    const raw = (meta as Record<string, unknown>).summary;
                    if (typeof raw === "string") summary = raw.trim();
                  }
                }

                if (
                  !rfqItems.length &&
                  !categoryLabel &&
                  !lead.subject &&
                  !summary &&
                  !lead.parseError
                ) {
                  return null;
                }

                return (
                  <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">Extracted RFQ</h3>
                      {confidence != null ? (
                        <span className="rounded-full bg-mid-green/15 px-2 py-0.5 text-[10px] font-medium text-mid-green">
                          {confidence}% confidence
                        </span>
                      ) : null}
                    </div>

                    {lead.subject ? (
                      <p className="mt-2 text-xs text-mid-green">
                        <span className="font-medium text-dark-primary">
                          Subject:{" "}
                        </span>
                        {lead.subject}
                      </p>
                    ) : null}

                    {categoryLabel ? (
                      <p className="mt-1 text-xs text-mid-green">
                        <span className="font-medium text-dark-primary">
                          Category:{" "}
                        </span>
                        {categoryLabel}
                      </p>
                    ) : null}

                    {summary ? (
                      <p className="mt-2 text-xs leading-relaxed text-dark-primary">
                        {summary}
                      </p>
                    ) : null}

                    {lead.parseError ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                        Parse note: {lead.parseError}
                      </p>
                    ) : null}

                    {rfqItems.length ? (
                      <div className="mt-3 space-y-2">
                        {rfqItems.map((item) => (
                          <div
                            key={`${item.lineNumber}-${item.description}`}
                            className="rounded-lg bg-dark-secondary/[0.04] px-2.5 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-dark-primary">
                                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-mid-green">
                                  #{item.lineNumber}
                                </span>
                                {item.description}
                              </p>
                              <p className="shrink-0 text-xs font-medium tabular-nums text-dark-primary">
                                {item.quantity} {item.unit}
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mid-green">
                              {item.brand ? <span>Brand: {item.brand}</span> : null}
                              {item.model ? <span>Model: {item.model}</span> : null}
                              {item.category ? (
                                <span>Cat: {item.category}</span>
                              ) : null}
                              {item.code ? <span>Code: {item.code}</span> : null}
                            </div>
                            {item.extraNotes ? (
                              <p className="mt-1 text-[11px] text-mid-green">
                                {item.extraNotes}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-mid-green">
                        No structured line items yet — raw requirement is above.
                      </p>
                    )}
                  </section>
                );
              })()}

              <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                <h3 className="text-sm font-semibold">Pipeline</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-mid-green">
                    Stage
                    <select
                      value={lead.leadStage}
                      disabled={saving}
                      onChange={(e) => void changeStage(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-mid-green">
                    Priority
                    <select
                      value={lead.priority}
                      disabled={saving}
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
                  <label className="text-xs text-mid-green sm:col-span-2">
                    Owner
                    <select
                      value={lead.assignedTo?.id || ""}
                      disabled={saving}
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
                  {(lead.leadStage === "DISQUALIFIED" ||
                    lead.leadStage === "DEAL_LOST") && (
                    <label className="text-xs text-mid-green sm:col-span-2">
                      Stage reason (for next change)
                      <input
                        value={stageReason}
                        onChange={(e) => setStageReason(e.target.value)}
                        className="mt-1 h-9 w-full rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
                      />
                    </label>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                <h3 className="text-sm font-semibold">Quotations</h3>
                <div className="mt-2 space-y-2">
                  {lead.quotes.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between rounded-lg bg-dark-secondary/[0.04] px-3 py-2 text-sm"
                    >
                      <div>
                        <Link
                          href={`/quotes/${q.id}`}
                          className="font-medium hover:underline"
                        >
                          {q.quoteNumber}
                        </Link>
                        <p className="text-[11px] text-mid-green">
                          {q.status.replaceAll("_", " ")} · {money(q.grandTotal)}
                          {q.needsAssistance ? " · needs reply" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!lead.quotes.length ? (
                    <p className="text-xs text-mid-green">No quotations yet.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                <h3 className="text-sm font-semibold">Follow-up</h3>
                <div className="mt-2 space-y-2">
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
                  <DateTimePicker
                    id="drawer-follow-due"
                    value={followDue}
                    onChange={setFollowDue}
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
                <div className="mt-3 space-y-1.5">
                  {lead.followUps.slice(0, 5).map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg bg-dark-secondary/[0.04] px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          {f.type} · {f.status}
                        </span>
                        <span>{format(new Date(f.dueAt), "dd MMM HH:mm")}</span>
                      </div>
                      <p className="mt-0.5 text-mid-green">
                        {f.title || f.notes}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-dark-primary/8 bg-white p-3">
                <h3 className="text-sm font-semibold">Activity</h3>
                <div className="mt-2 flex gap-2">
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
                <div className="mt-3 space-y-2">
                  {lead.activities.slice(0, 8).map((a) => (
                    <div key={a.id} className="border-l-2 border-mid-green/30 pl-2 text-xs">
                      <p className="font-medium text-dark-primary">
                        {a.title || a.type}
                      </p>
                      {a.body ? (
                        <p className="mt-0.5 line-clamp-2 text-mid-green">
                          {a.body}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-mid-green/80">
                        {formatDistanceToNowStrict(new Date(a.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
