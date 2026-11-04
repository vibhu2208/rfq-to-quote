"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Inbox,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Store,
  UserRound,
  Globe,
} from "lucide-react";
import { StatusBadge } from "@/components/ui";

type RfqRow = {
  id: string;
  channel: string;
  subject: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  status: string;
  parsedCategory: string | null;
  parseConfidence: number | null;
  createdAt: string;
  _count: { messages: number; quotes: number };
};

const CHANNELS = ["MANUAL", "EMAIL", "WEB_FORM", "MARKETPLACE", "WHATSAPP"] as const;
const STATUS_PILLS = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "NEEDS_REVIEW", label: "Review" },
  { value: "PARSED", label: "Parsed" },
  { value: "QUOTED", label: "Quoted" },
  { value: "CLOSED", label: "Closed" },
] as const;

const channelMeta: Record<
  string,
  { label: string; icon: typeof Mail; tone: string }
> = {
  MANUAL: {
    label: "Manual",
    icon: UserRound,
    tone: "bg-dark-secondary/8 text-dark-secondary",
  },
  EMAIL: {
    label: "Outlook",
    icon: Mail,
    tone: "bg-mid-green/15 text-mid-green",
  },
  WEB_FORM: {
    label: "Web form",
    icon: Globe,
    tone: "bg-light-green/40 text-dark-primary",
  },
  MARKETPLACE: {
    label: "Marketplace",
    icon: Store,
    tone: "bg-dark-primary/10 text-dark-primary",
  },
  WHATSAPP: {
    label: "WhatsApp",
    icon: MessageCircle,
    tone: "bg-mid-green/20 text-dark-secondary",
  },
};

function customerLabel(row: RfqRow) {
  return row.customerCompany || row.customerName || row.customerEmail || "Untitled lead";
}

function relativeTime(value: string) {
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

export default function InboxPage() {
  const [rows, setRows] = useState<RfqRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [pollMsg, setPollMsg] = useState("");
  const [polling, setPolling] = useState(false);
  const [waIntakeOpen, setWaIntakeOpen] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState("");
  const [waForm, setWaForm] = useState({
    text: "",
    from: "",
    name: "",
  });

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (channel) params.set("channel", channel);
      if (status) params.set("status", status);
      const res = await fetch(`/api/rfqs?${params}`);
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
        setCounts({});
      } else if (data && Array.isArray(data.items)) {
        setRows(data.items);
        setTotal(typeof data.total === "number" ? data.total : data.items.length);
        setCounts(
          data.counts && typeof data.counts === "object" ? data.counts : {}
        );
      } else {
        setRows([]);
        setTotal(0);
        setCounts({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, channel, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(rows.length > 0), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function pollInbox() {
    setPolling(true);
    setPollMsg("Checking Outlook + WhatsApp…");
    try {
      const res = await fetch("/api/cron/inbox-poll", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPollMsg(
          typeof data.error === "string" ? data.error : "Inbox poll failed"
        );
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
          `Outlook · fetched ${email?.fetched ?? data.fetched ?? 0} · RFQs ${email?.created ?? 0} · skipped ${email?.skipped ?? data.skipped ?? 0} (requirements only) · vendor ${email?.vendorReplies ?? data.vendorReplies ?? 0} · quote ${email?.quoteReplies ?? data.quoteReplies ?? 0}`
        );
      }
      if (whatsapp) {
        if (whatsapp.created > 0) {
          parts.push(
            `WhatsApp · RFQs ${whatsapp.created} · skipped ${whatsapp.skipped ?? 0} (requirements only)`
          );
        } else {
          parts.push(
            whatsapp.available
              ? "WhatsApp · no new webhook messages (Meta cannot be polled — use Add WhatsApp if a chat was missed)"
              : "WhatsApp · not configured"
          );
        }
      }
      setPollMsg(parts.join(" · "));
      await load(true);
    } finally {
      setPolling(false);
    }
  }

  async function submitWhatsAppIntake() {
    setWaError("");
    const text = waForm.text.trim();
    if (!text) {
      setWaError("Paste the WhatsApp requirement message.");
      return;
    }
    setWaBusy(true);
    try {
      const res = await fetch("/api/rfqs/whatsapp-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          from: waForm.from.trim(),
          name: waForm.name.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWaError(
          typeof data.error === "string"
            ? data.error
            : "Could not import WhatsApp message"
        );
        return;
      }
      setWaForm({ text: "", from: "", name: "" });
      setWaIntakeOpen(false);
      setPollMsg(`WhatsApp requirement imported${data.id ? ` · ${data.id}` : ""}`);
      await load(true);
    } finally {
      setWaBusy(false);
    }
  }

  const openCount = useMemo(
    () =>
      (counts.NEW || 0) +
      (counts.NEEDS_REVIEW || 0) +
      (counts.PARSED || 0),
    [counts]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-dark-primary">
            Inbox
          </h1>
          <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-xs font-medium tabular-nums text-mid-green">
            {loading && rows.length === 0 ? "…" : total}
          </span>
          {openCount > 0 ? (
            <span className="rounded-full bg-mid-green/15 px-2 py-0.5 text-[11px] font-medium text-mid-green">
              {openCount} open
            </span>
          ) : null}
        </div>

        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green/70"
            strokeWidth={1.5}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, subject, category…"
            aria-label="Search RFQs"
            className="h-9 w-full rounded-full border-0 bg-dark-secondary/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-mid-green/60 focus:bg-white focus:ring-1 focus:ring-mid-green/30"
          />
        </div>

        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          aria-label="Channel"
          className="h-9 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-sm text-dark-primary outline-none focus:bg-white focus:ring-1 focus:ring-mid-green/30"
        >
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {channelMeta[c]?.label || c}
            </option>
          ))}
        </select>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setWaIntakeOpen((open) => !open);
              setWaError("");
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green/15 px-3 text-sm font-medium text-dark-primary transition hover:bg-mid-green/25"
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
            Add WhatsApp
          </button>
          <button
            type="button"
            onClick={() => void pollInbox()}
            disabled={polling}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-dark-secondary/[0.05] px-3 text-sm font-medium text-mid-green transition hover:bg-light-green/20 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
            {polling ? "Polling…" : "Poll inbox"}
          </button>
          <Link
            href="/request"
            target="_blank"
            className="inline-flex h-9 items-center rounded-full bg-dark-secondary/[0.05] px-3 text-sm font-medium text-mid-green transition hover:bg-light-green/20"
          >
            Public form
          </Link>
          <Link
            href="/rfq/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Capture
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_PILLS.map((pill) => {
          const active = status === pill.value;
          const count =
            pill.value === ""
              ? Object.values(counts).reduce((sum, n) => sum + n, 0) || total
              : counts[pill.value] || 0;
          return (
            <button
              key={pill.value || "all"}
              type="button"
              onClick={() => setStatus(pill.value)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition ${
                active
                  ? "bg-mid-green text-background"
                  : "bg-dark-secondary/[0.05] text-mid-green hover:bg-light-green/20"
              }`}
            >
              {pill.label}
              <span
                className={`tabular-nums ${
                  active ? "text-background/80" : "text-mid-green/70"
                }`}
              >
                {loading && rows.length === 0 ? "–" : count}
              </span>
            </button>
          );
        })}
        {refreshing ? (
          <span className="ml-1 text-xs text-mid-green/70">Updating…</span>
        ) : null}
      </div>

      {pollMsg ? (
        <p className="rounded-xl bg-mid-green/10 px-3 py-2 text-xs text-mid-green">
          {pollMsg}
        </p>
      ) : null}

      {waIntakeOpen ? (
        <div className="rounded-2xl border border-light-green/30 bg-white/70 p-4 shadow-[0_8px_24px_rgba(11,43,38,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-dark-primary">
                Import WhatsApp requirement
              </h2>
              <p className="mt-0.5 text-xs text-mid-green">
                Meta does not let us download chat history. If the webhook missed a
                message (common on localhost), paste it here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWaIntakeOpen(false)}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              Close
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={waForm.name}
              onChange={(event) =>
                setWaForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Customer name (optional)"
              className="h-9 rounded-xl border border-light-green/35 bg-white px-3 text-sm outline-none focus:border-mid-green"
            />
            <input
              value={waForm.from}
              onChange={(event) =>
                setWaForm((current) => ({ ...current, from: event.target.value }))
              }
              placeholder="WhatsApp number +91… (optional)"
              className="h-9 rounded-xl border border-light-green/35 bg-white px-3 text-sm outline-none focus:border-mid-green"
            />
          </div>
          <textarea
            value={waForm.text}
            onChange={(event) =>
              setWaForm((current) => ({ ...current, text: event.target.value }))
            }
            placeholder='e.g. i need Samsung M2876ND Printer'
            rows={4}
            className="mt-2 w-full resize-y rounded-xl border border-light-green/35 bg-white px-3 py-2 text-sm outline-none focus:border-mid-green"
          />
          {waError ? (
            <p className="mt-2 text-xs text-red-700">{waError}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={waBusy}
              onClick={() => setWaIntakeOpen(false)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-mid-green hover:bg-light-green/20 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={waBusy}
              onClick={() => void submitWhatsAppIntake()}
              className="inline-flex items-center gap-1.5 rounded-full bg-mid-green px-3.5 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
              {waBusy ? "Importing…" : "Add to inbox"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-light-green/25 bg-white/55 shadow-[0_8px_30px_rgba(11,43,38,0.05)]">
        <div className="hidden grid-cols-[6.5rem_7rem_minmax(0,1.1fr)_minmax(0,1.4fr)_6.5rem_4.5rem_4rem] gap-3 border-b border-light-green/20 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-mid-green md:grid">
          <span>Received</span>
          <span>Channel</span>
          <span>Customer</span>
          <span>Subject</span>
          <span>Status</span>
          <span className="text-right">Quotes</span>
          <span className="text-right">Conf.</span>
        </div>

        {loading && rows.length === 0 ? (
          <ul className="divide-y divide-light-green/15">
            {Array.from({ length: 8 }).map((_, index) => (
              <li key={index} className="animate-pulse px-4 py-3.5">
                <div className="flex gap-3">
                  <div className="h-3 w-16 rounded bg-dark-secondary/10" />
                  <div className="h-3 w-20 rounded bg-dark-secondary/10" />
                  <div className="h-3 flex-1 rounded bg-dark-secondary/10" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mid-green/10 text-mid-green">
              <Inbox className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-medium text-dark-primary">No RFQs yet</p>
              <p className="mt-1 max-w-sm text-xs text-mid-green">
                Capture a live requirement, share the public form, or poll inbox for
                Outlook mail and WhatsApp requirement messages.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Link
                href="/rfq/new"
                className="inline-flex h-9 items-center rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary"
              >
                Capture requirement
              </Link>
              <Link
                href="/request"
                className="inline-flex h-9 items-center rounded-full bg-dark-secondary/[0.05] px-3.5 text-sm font-medium text-mid-green hover:bg-light-green/20"
              >
                Open public form
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-light-green/15">
            {rows.map((row) => {
              const meta = channelMeta[row.channel] || channelMeta.MANUAL;
              const Icon = meta.icon;
              return (
                <li key={row.id}>
                  <Link
                    href={`/rfq/${row.id}`}
                    className="grid grid-cols-1 gap-2 px-4 py-3.5 transition hover:bg-light-green/15 md:grid-cols-[6.5rem_7rem_minmax(0,1.1fr)_minmax(0,1.4fr)_6.5rem_4.5rem_4rem] md:items-center md:gap-3"
                  >
                    <div className="text-xs text-mid-green">
                      <span className="md:hidden font-medium text-dark-primary">
                        Received ·{" "}
                      </span>
                      {relativeTime(row.createdAt)}
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}
                      >
                        <Icon className="h-3 w-3" strokeWidth={1.75} />
                        {meta.label}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-dark-primary">
                        {customerLabel(row)}
                      </div>
                      {row.customerEmail ? (
                        <div className="truncate text-xs text-mid-green">
                          {row.customerEmail}
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-dark-primary">
                        {row.subject || "—"}
                      </div>
                      <div className="truncate text-xs text-mid-green">
                        {row.parsedCategory ||
                          (row._count.messages > 0
                            ? `${row._count.messages} message${row._count.messages === 1 ? "" : "s"}`
                            : "Awaiting parse")}
                      </div>
                    </div>
                    <div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="text-right text-xs tabular-nums text-mid-green">
                      <span className="md:hidden">Quotes · </span>
                      {row._count.quotes}
                    </div>
                    <div className="text-right text-xs tabular-nums text-mid-green">
                      <span className="md:hidden">Confidence · </span>
                      {row.parseConfidence != null
                        ? `${Math.round(row.parseConfidence * 100)}%`
                        : "—"}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
