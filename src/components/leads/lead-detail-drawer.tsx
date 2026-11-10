"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ChevronDown, X } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useLeadDetail } from "@/hooks/use-lead-detail";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_INTAKE_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
} from "@/lib/leads/constants";
import { leadsKeys } from "@/lib/leads/query";
import { extractRfqItems } from "@/lib/rfq-items";

function DrawerCollapse({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-dark-primary/10 pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 py-1 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-dark-primary">
          {title}
        </span>
        {meta ? (
          <span className="truncate text-xs text-mid-green">{meta}</span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-mid-green transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.5}
        />
      </button>
      {open ? <div className="pt-3">{children}</div> : null}
    </section>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-dark-secondary/20 ${className || ""}`}
    />
  );
}

function LeadDrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading lead">
      <div className="shrink-0 border-b border-dark-primary/8 px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-7 w-48" />
            <SkeletonBar className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <SkeletonBar className="h-8 w-24 rounded-md" />
            <SkeletonBar className="h-8 w-12 rounded-md" />
            <SkeletonBar className="h-8 w-20 rounded-md" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-mid-green/70 hover:bg-dark-secondary/8 hover:text-dark-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-dark-primary/8 pt-3">
          <div className="space-y-2">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="h-5 w-36 max-w-full" />
          </div>
          <div className="space-y-2">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="h-5 w-28 max-w-full" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-5 rounded-2xl border border-dark-primary/8 bg-white p-4 shadow-[0_1px_0_rgba(11,43,38,0.04)]">
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <SkeletonBar className="h-5 w-28" />
              <SkeletonBar className="h-4 w-24" />
            </div>
            <SkeletonBar className="h-4 w-full max-w-md" />
            <SkeletonBar className="h-44 w-full rounded-xl" />
            <SkeletonBar className="h-3 w-40" />
          </div>

          <div className="space-y-3 border-t border-dark-primary/8 pt-4">
            <SkeletonBar className="h-5 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <SkeletonBar className="h-3 w-16" />
                  <SkeletonBar className="h-11 w-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-dark-primary/8 pt-4">
            <div className="flex items-center justify-between">
              <SkeletonBar className="h-5 w-24" />
              <SkeletonBar className="h-4 w-16" />
            </div>
            <SkeletonBar className="h-16 w-full rounded-xl" />
          </div>

          <div className="space-y-3 border-t border-dark-primary/8 pt-4">
            <div className="flex items-center justify-between">
              <SkeletonBar className="h-5 w-28" />
              <SkeletonBar className="h-4 w-12" />
            </div>
            <SkeletonBar className="h-14 w-full rounded-xl" />
            <SkeletonBar className="h-14 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

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

export type LeadDrawerRowPatch = {
  leadStage?: string;
  priority?: string;
  intakeKind?: "REQUIREMENT" | "JUNK" | "SKIPPED";
  assignedTo?: User | null;
  nextFollowUpAt?: string | null;
  customerName?: string;
  customerCompany?: string;
  customerEmail?: string;
  customerPhone?: string;
  subject?: string;
  rawText?: string;
  category?: string;
  expectedValue?: string | number | null;
};

type Props = {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  /** Optional users from parent — avoids refetching /api/leads/users on every open. */
  users?: User[];
  onChanged?: (patch?: LeadDrawerRowPatch) => void;
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

export function LeadDetailDrawer({
  leadId,
  open,
  onClose,
  users: usersProp = [],
  onChanged,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [followTitle, setFollowTitle] = useState("");
  const [followDue, setFollowDue] = useState("");
  const [followType, setFollowType] = useState("CALL");
  const [stageReason, setStageReason] = useState("");
  const [rfqOpen, setRfqOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);

  const users = usersProp;
  const {
    data: leadData,
    isLoading,
    isFetching,
    isFetched,
    isError,
    refetch,
  } = useLeadDetail(leadId, {
    view: "drawer",
    enabled: open && Boolean(leadId),
  });
  const rawLead = (leadData as LeadDetail | null | undefined) ?? null;
  // Only treat data as ready when it matches the open lead (avoids stale flash).
  const lead =
    rawLead && leadId && rawLead.id === leadId ? rawLead : null;
  const loading =
    Boolean(leadId) &&
    !lead &&
    (isLoading || isFetching || !isFetched) &&
    !isError;

  function setLead(updater: (prev: LeadDetail | null) => LeadDetail | null) {
    if (!leadId) return;
    queryClient.setQueryData(
      leadsKeys.detail(leadId, "drawer"),
      (prev: LeadDetail | null | undefined) => updater(prev ?? null)
    );
  }

  async function load() {
    await refetch();
  }

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

  useEffect(() => {
    setRfqOpen(false);
    setActivityOpen(false);
    setFollowOpen(false);
    setQuotesOpen(false);
  }, [leadId]);

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
      const updated = (await res.json()) as Partial<LeadDetail> & {
        assignedTo?: User | null;
      };
      setLead((prev) => (prev ? { ...prev, ...updated } : prev));
      const rowPatch: LeadDrawerRowPatch = {};
      if (updated.priority !== undefined) rowPatch.priority = updated.priority;
      if (updated.customerName !== undefined)
        rowPatch.customerName = updated.customerName;
      if (updated.customerCompany !== undefined)
        rowPatch.customerCompany = updated.customerCompany;
      if (updated.customerEmail !== undefined)
        rowPatch.customerEmail = updated.customerEmail;
      if (updated.customerPhone !== undefined)
        rowPatch.customerPhone = updated.customerPhone;
      if (updated.subject !== undefined) rowPatch.subject = updated.subject;
      if (updated.rawText !== undefined) rowPatch.rawText = updated.rawText;
      if (updated.category !== undefined) rowPatch.category = updated.category;
      if (updated.expectedValue !== undefined)
        rowPatch.expectedValue = updated.expectedValue;
      if (updated.assignedTo !== undefined)
        rowPatch.assignedTo = updated.assignedTo;
      onChanged?.(rowPatch);
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
      const updated = (await res.json()) as { leadStage?: string };
      setStageReason("");
      setLead((prev) =>
        prev
          ? { ...prev, leadStage: updated.leadStage || toStage }
          : prev
      );
      onChanged?.({ leadStage: updated.leadStage || toStage });
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
      setLead((prev) =>
        prev ? { ...prev, intakeKind: "REQUIREMENT" } : prev
      );
      onChanged?.({ intakeKind: "REQUIREMENT" });
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!leadId || !note.trim()) return;
    const body = note.trim();
    const res = await fetch(`/api/leads/${leadId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return;
    const created = (await res.json().catch(() => null)) as {
      id?: string;
      type?: string;
      title?: string;
      body?: string;
      createdAt?: string;
    } | null;
    setNote("");
    setLead((prev) =>
      prev
        ? {
            ...prev,
            activities: [
              {
                id: created?.id || `local-${Date.now()}`,
                type: created?.type || "NOTE",
                title: created?.title || "Note",
                body: created?.body || body,
                createdAt: created?.createdAt || new Date().toISOString(),
              },
              ...prev.activities,
            ],
          }
        : prev
    );
    onChanged?.();
  }

  async function scheduleFollowUp() {
    if (!leadId || !followDue) return;
    const dueIso = new Date(followDue).toISOString();
    const res = await fetch(`/api/leads/${leadId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: followType,
        dueAt: dueIso,
        title: followTitle,
      }),
    });
    if (!res.ok) return;
    const created = (await res.json().catch(() => null)) as {
      id?: string;
      type?: string;
      status?: string;
      dueAt?: string;
      title?: string;
      notes?: string;
    } | null;
    setFollowTitle("");
    setFollowDue("");
    setLead((prev) =>
      prev
        ? {
            ...prev,
            nextFollowUpAt: dueIso,
            followUps: [
              {
                id: created?.id || `local-${Date.now()}`,
                type: created?.type || followType,
                status: created?.status || "PENDING",
                dueAt: created?.dueAt || dueIso,
                title: created?.title || followTitle,
                notes: created?.notes || "",
              },
              ...prev.followUps,
            ],
          }
        : prev
    );
    onChanged?.({ nextFollowUpAt: dueIso });
  }

  if (!open) return null;

  const latestQuote = lead?.quotes[0] || null;
  const nextFollowUp = lead?.followUps[0] || null;
  const rfqItems = lead
    ? extractRfqItems(lead.parsedSpecs, lead.rawText)
    : [];
  const categoryLabel = lead
    ? lead.category || lead.parsedCategory || ""
    : "";
  const confidence =
    lead && typeof lead.parseConfidence === "number"
      ? Math.round(lead.parseConfidence * 100)
      : null;
  let rfqSummary = "";
  if (lead?.parsedSpecs && typeof lead.parsedSpecs === "object") {
    const root = lead.parsedSpecs as Record<string, unknown>;
    const meta = root._meta;
    if (meta && typeof meta === "object") {
      const raw = (meta as Record<string, unknown>).summary;
      if (typeof raw === "string") rfqSummary = raw.trim();
    }
  }
  const hasExtractedRfq = Boolean(
    lead &&
      (rfqItems.length ||
        categoryLabel ||
        lead.subject ||
        rfqSummary ||
        lead.parseError)
  );
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
        {loading ? (
          <LeadDrawerSkeleton onClose={onClose} />
        ) : !lead ? (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-dark-primary/8 px-5 pt-4 pb-3">
              <h2
                id="lead-drawer-title"
                className="text-xl font-semibold text-dark-primary"
              >
                Lead
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-mid-green/70 hover:bg-dark-secondary/8 hover:text-dark-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-mid-green">Lead not found.</p>
            </div>
          </>
        ) : (
          <>
        {/* Header blends with drawer background */}
        <div className="shrink-0 border-b border-dark-primary/8 px-5 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2
                id="lead-drawer-title"
                className="truncate text-xl font-semibold tracking-tight text-dark-primary"
              >
                {lead.customerCompany ||
                  lead.customerName ||
                  lead.leadNumber ||
                  "Lead"}
              </h2>
              <p className="mt-1 truncate text-sm text-mid-green">
                {lead.leadNumber}
                {" · "}
                {LEAD_STAGE_LABELS[
                  lead.leadStage as keyof typeof LEAD_STAGE_LABELS
                ] || lead.leadStage}
                {" · "}
                {LEAD_PRIORITY_LABELS[
                  lead.priority as keyof typeof LEAD_PRIORITY_LABELS
                ] || lead.priority}
                {lead.intakeKind !== "REQUIREMENT"
                  ? ` · ${LEAD_INTAKE_LABELS[lead.intakeKind]}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void promoteFromJunk()}
                  className="rounded-md bg-amber-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  Promote
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void createQuote()}
                  className="rounded-md bg-mid-green px-2.5 py-1.5 text-sm font-semibold text-background hover:bg-dark-secondary disabled:opacity-60"
                >
                  Create quote
                </button>
              )}
              <Link
                href={`/rfq/${lead.id}`}
                className="rounded-md bg-dark-primary/8 px-2.5 py-1.5 text-sm font-semibold text-dark-primary hover:bg-dark-primary/12"
              >
                RFQ
              </Link>
              <Link
                href={`/leads/${lead.id}`}
                className="rounded-md bg-dark-primary/8 px-2.5 py-1.5 text-sm font-semibold text-dark-primary hover:bg-dark-primary/12"
              >
                Full page
              </Link>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-mid-green/70 hover:bg-dark-secondary/8 hover:text-dark-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-dark-primary/8 pt-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-mid-green/80">
                Quotation
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuotesOpen((v) => !v);
                  setFollowOpen(false);
                }}
                className={`mt-1 flex w-full items-center gap-1 truncate text-left text-base font-semibold underline decoration-mid-green/40 underline-offset-4 transition hover:text-mid-green hover:decoration-mid-green ${
                  quotesOpen ? "text-mid-green" : "text-dark-primary"
                }`}
              >
                <span className="min-w-0 truncate">
                  {latestQuote
                    ? `${latestQuote.quoteNumber} · ${money(latestQuote.grandTotal)}`
                    : "None yet"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    quotesOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={1.75}
                />
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-mid-green/80">
                Follow-up
              </p>
              <button
                type="button"
                onClick={() => {
                  setFollowOpen((v) => !v);
                  setQuotesOpen(false);
                }}
                className={`mt-1 flex w-full items-center gap-1 truncate text-left text-base font-semibold underline decoration-mid-green/40 underline-offset-4 transition hover:text-mid-green hover:decoration-mid-green ${
                  followOpen ? "text-mid-green" : "text-dark-primary"
                }`}
              >
                <span className="min-w-0 truncate">
                  {nextFollowUp
                    ? format(new Date(nextFollowUp.dueAt), "dd MMM · HH:mm")
                    : lead.nextFollowUpAt
                      ? format(new Date(lead.nextFollowUpAt), "dd MMM · HH:mm")
                      : "Not scheduled"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    followOpen ? "rotate-180" : ""
                  }`}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          </div>

          {quotesOpen ? (
            <div className="mt-3 space-y-1 border-t border-dark-primary/8 pt-3">
              {lead.quotes.length ? (
                lead.quotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/quotes/${q.id}`}
                    className="flex items-baseline justify-between gap-3 py-1.5 text-sm hover:underline"
                  >
                    <span className="min-w-0 truncate text-dark-primary">
                      {q.quoteNumber}
                      <span className="ml-2 text-mid-green">
                        {q.status.replaceAll("_", " ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-mid-green">
                      {money(q.grandTotal)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-1 text-sm text-mid-green">No quotations yet.</p>
              )}
              {negotiationQuotes[0]?.messages?.[0] ? (
                <p className="mt-1 line-clamp-2 text-sm text-amber-900/90">
                  {negotiationQuotes[0].messages[0].body.trim() ||
                    negotiationQuotes[0].messages[0].subject}
                </p>
              ) : null}
            </div>
          ) : null}

          {followOpen ? (
            <div className="mt-3 space-y-2 border-t border-dark-primary/8 pt-3">
              {lead.followUps.slice(0, 3).map((f) => (
                <div
                  key={f.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <p className="min-w-0 truncate text-dark-primary">
                    {f.title || f.type}
                  </p>
                  <span className="shrink-0 text-mid-green">
                    {format(new Date(f.dueAt), "dd MMM HH:mm")}
                  </span>
                </div>
              ))}
              <select
                value={followType}
                onChange={(e) => setFollowType(e.target.value)}
                className="h-10 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-sm outline-none"
              >
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Meeting</option>
                <option value="TASK">Task</option>
              </select>
              <input
                value={followTitle}
                onChange={(e) => setFollowTitle(e.target.value)}
                placeholder="Title / notes"
                className="h-10 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-sm outline-none"
              />
              <DateTimePicker
                id="drawer-follow-due"
                value={followDue}
                onChange={setFollowDue}
              />
              <button
                type="button"
                onClick={() => void scheduleFollowUp()}
                className="text-sm font-medium text-mid-green hover:text-dark-primary"
              >
                Schedule follow-up
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              {lead.intakeKind === "JUNK" || lead.intakeKind === "SKIPPED" ? (
                <div className="border-l-2 border-amber-500 pl-3 text-sm text-amber-900">
                  <p className="font-medium">
                    Stored as {LEAD_INTAKE_LABELS[lead.intakeKind].toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-amber-800/90">
                    {lead.junkReason ||
                      lead.disqualifyReason ||
                      "Not treated as a product requirement."}
                  </p>
                </div>
              ) : null}

              {/* Requirement — the focus of the drawer */}
              <section>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-base font-semibold text-dark-primary">
                    Requirement
                  </h3>
                  {lead.customerPhone ? (
                    <a
                      href={`tel:${lead.customerPhone}`}
                      className="text-sm font-medium text-mid-green hover:underline"
                    >
                      Call {lead.customerPhone}
                    </a>
                  ) : null}
                </div>
                {lead.subject ? (
                  <p className="mt-2 text-sm font-medium text-dark-primary">
                    {lead.subject}
                  </p>
                ) : null}
                <textarea
                  defaultValue={lead.rawText}
                  key={`rq-${lead.id}-${lead.rawText.slice(0, 24)}`}
                  rows={8}
                  onBlur={(e) => {
                    if (e.target.value !== lead.rawText) {
                      void patch({ rawText: e.target.value });
                    }
                  }}
                  className="mt-3 w-full resize-y rounded-none border-0 border-b border-dark-primary/15 bg-transparent px-0 py-2 text-[15px] leading-relaxed text-dark-primary outline-none focus:border-mid-green"
                  placeholder="Customer requirement…"
                />
                <p className="mt-1.5 text-xs text-mid-green/80">
                  {LEAD_CHANNEL_LABELS[
                    lead.channel as keyof typeof LEAD_CHANNEL_LABELS
                  ] || lead.channel}
                  {" · "}
                  {formatDistanceToNowStrict(new Date(lead.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </section>

              <section>
                <h3 className="text-base font-semibold text-dark-primary">
                  Contact & pipeline
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-mid-green">
                    Company
                    <input
                      defaultValue={lead.customerCompany}
                      key={`co-${lead.id}-${lead.customerCompany}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerCompany) {
                          void patch({ customerCompany: e.target.value });
                        }
                      }}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base text-dark-primary outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="text-sm text-mid-green">
                    Contact
                    <input
                      defaultValue={lead.customerName}
                      key={`nm-${lead.id}-${lead.customerName}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerName) {
                          void patch({ customerName: e.target.value });
                        }
                      }}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base text-dark-primary outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="text-sm text-mid-green">
                    Email
                    <input
                      defaultValue={lead.customerEmail}
                      key={`em-${lead.id}-${lead.customerEmail}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerEmail) {
                          void patch({ customerEmail: e.target.value });
                        }
                      }}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base text-dark-primary outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="text-sm text-mid-green">
                    Phone
                    <input
                      defaultValue={lead.customerPhone}
                      key={`ph-${lead.id}-${lead.customerPhone}`}
                      onBlur={(e) => {
                        if (e.target.value !== lead.customerPhone) {
                          void patch({ customerPhone: e.target.value });
                        }
                      }}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base text-dark-primary outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="text-sm text-mid-green">
                    Stage
                    <select
                      value={lead.leadStage}
                      disabled={saving}
                      onChange={(e) => void changeStage(e.target.value)}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base outline-none focus:border-mid-green"
                    >
                      {LEAD_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-mid-green">
                    Priority
                    <select
                      value={lead.priority}
                      disabled={saving}
                      onChange={(e) => void patch({ priority: e.target.value })}
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base outline-none focus:border-mid-green"
                    >
                      {LEAD_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {LEAD_PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-mid-green sm:col-span-2">
                    Owner
                    <select
                      value={lead.assignedTo?.id || ""}
                      disabled={saving}
                      onChange={(e) =>
                        void patch({
                          assignedToUserId: e.target.value || null,
                        })
                      }
                      className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base outline-none focus:border-mid-green"
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
                    <label className="text-sm text-mid-green sm:col-span-2">
                      Stage reason (for next change)
                      <input
                        value={stageReason}
                        onChange={(e) => setStageReason(e.target.value)}
                        className="mt-1 h-11 w-full border-0 border-b border-dark-primary/15 bg-transparent px-0 text-base outline-none focus:border-mid-green"
                      />
                    </label>
                  )}
                </div>
              </section>

              {hasExtractedRfq ? (
                <DrawerCollapse
                  title="Extracted RFQ"
                  meta={
                    [
                      confidence != null ? `${confidence}%` : null,
                      rfqItems.length ? `${rfqItems.length} lines` : null,
                      categoryLabel || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  open={rfqOpen}
                  onToggle={() => setRfqOpen((v) => !v)}
                >
                  {lead.subject ? (
                    <p className="text-xs text-mid-green">
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
                  {rfqSummary ? (
                    <p className="mt-2 text-xs leading-relaxed text-dark-primary">
                      {rfqSummary}
                    </p>
                  ) : null}
                  {lead.parseError ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                      Parse note: {lead.parseError}
                    </p>
                  ) : null}
                  {rfqItems.length ? (
                    <div className="mt-2 space-y-2">
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
                    <p className="mt-1 text-xs text-mid-green">
                      No structured line items — see requirement above.
                    </p>
                  )}
                </DrawerCollapse>
              ) : null}

              <DrawerCollapse
                title="Activity"
                meta={
                  lead.activities.length
                    ? `${Math.min(lead.activities.length, 8)} recent`
                    : "None yet"
                }
                open={activityOpen}
                onToggle={() => setActivityOpen((v) => !v)}
              >
                <div className="flex gap-2">
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
                    <div
                      key={a.id}
                      className="border-l-2 border-mid-green/30 pl-2 text-xs"
                    >
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
                  {!lead.activities.length ? (
                    <p className="text-xs text-mid-green">No activity yet.</p>
                  ) : null}
                </div>
              </DrawerCollapse>
            </div>
        </div>
          </>
        )}
      </aside>
    </div>
  );
}
