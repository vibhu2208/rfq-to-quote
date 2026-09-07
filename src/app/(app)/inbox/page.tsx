"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";
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

const channels = ["", "MANUAL", "EMAIL", "WEB_FORM", "MARKETPLACE", "WHATSAPP"] as const;
const statuses = ["", "NEW", "NEEDS_REVIEW", "PARSED", "QUOTED", "CLOSED"] as const;

export default function InboxPage() {
  const [rows, setRows] = useState<RfqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [pollMsg, setPollMsg] = useState("");
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (channel) params.set("channel", channel);
    if (status) params.set("status", status);
    const res = await fetch(`/api/rfqs?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, channel, status]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function pollGmail() {
    setPolling(true);
    setPollMsg("Checking Gmail…");
    const res = await fetch("/api/cron/gmail-poll", { method: "POST" });
    const data = await res.json();
    setPolling(false);
    if (!res.ok) {
      setPollMsg(typeof data.error === "string" ? data.error : "Gmail poll failed");
      return;
    }
    if (data.initialized) {
      setPollMsg(
        "Gmail checkpoint initialized. Old unread mail was ignored; only newer messages will be imported now."
      );
    } else {
      setPollMsg(
        `Gmail: fetched ${data.fetched}, RFQs created ${data.created}, vendor replies ${data.vendorReplies ?? 0}, skipped ${data.skipped}`
      );
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">RFQ Inbox</h1>
          <p className="mt-1 text-sm text-mid-green">
            All leads — team capture, web form, Gmail, and marketplace
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/rfq/new"
            className="rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            Capture requirement
          </Link>
          <button
            type="button"
            onClick={pollGmail}
            disabled={polling}
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm text-mid-green hover:bg-light-green/20 disabled:opacity-60"
          >
            {polling ? "Polling…" : "Poll Gmail"}
          </button>
          <Link
            href="/request"
            target="_blank"
            className="rounded-lg border border-light-green/50 bg-white/50 px-3 py-2 text-sm text-mid-green hover:bg-light-green/20"
          >
            Public form ↗
          </Link>
        </div>
      </div>

      {pollMsg ? <p className="text-sm text-mid-green">{pollMsg}</p> : null}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid-green"
            strokeWidth={1.5}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, subject, text…"
            className="w-full rounded-lg border border-light-green/40 bg-white/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-mid-green"
          />
        </div>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm"
        >
          <option value="">All channels</option>
          {channels.filter(Boolean).map((c) => (
            <option key={c} value={c}>
              {c.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-light-green/40 bg-white/50 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {statuses.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-dark-secondary/5 text-mid-green">
            <tr>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Subject / category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-mid-green">
                  No RFQs yet.{" "}
                  <Link href="/rfq/new" className="underline">
                    Capture a requirement
                  </Link>
                  , use the{" "}
                  <Link href="/request" className="underline">
                    public form
                  </Link>
                  , or poll Gmail.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 1 ? "bg-light-green/10" : undefined}>
                  <td className="px-4 py-3 text-mid-green whitespace-nowrap">
                    {format(new Date(r.createdAt), "dd MMM HH:mm")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-light-green/25 px-2 py-0.5 text-xs font-medium text-dark-primary">
                      {r.channel.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/rfq/${r.id}`} className="font-medium hover:text-mid-green">
                      {r.customerCompany || r.customerName || r.customerEmail || "—"}
                    </Link>
                    {r.customerEmail ? (
                      <div className="text-xs text-mid-green">{r.customerEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="line-clamp-1">{r.subject || "—"}</div>
                    {r.parsedCategory ? (
                      <div className="text-xs text-mid-green">{r.parsedCategory}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-mid-green">
                    {r.parseConfidence != null ? `${Math.round(r.parseConfidence * 100)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
