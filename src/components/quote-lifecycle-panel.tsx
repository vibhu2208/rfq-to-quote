"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { StatusBadge } from "@/components/ui";

type LifecycleMessage = {
  id: string;
  direction: "IN" | "OUT";
  subject: string;
  body: string;
  fromEmail: string;
  toEmail: string;
  intent: string | null;
  analysis: unknown;
  autoReplied: boolean;
  createdAt: string;
};

type LifecycleStage = {
  key: string;
  label: string;
  at: string | null;
  active: boolean;
  done: boolean;
};

type LifecyclePayload = {
  quote: {
    id: string;
    quoteNumber: string;
    status: string;
    needsAssistance: boolean;
    assistanceReason: string;
    lastBuyerReplyAt: string | null;
    lastReplyIntent: string | null;
    lastAnalysisSummary: string;
    sentAt: string | null;
    buyerEmail: string;
  };
  stages: LifecycleStage[];
  messages: LifecycleMessage[];
};

function analysisSummary(analysis: unknown): string {
  if (!analysis || typeof analysis !== "object") return "";
  const a = analysis as { summary?: string; suggestedReply?: string; confidence?: number };
  return typeof a.summary === "string" ? a.summary : "";
}

function unknownAsks(analysis: unknown): string[] {
  if (!analysis || typeof analysis !== "object") return [];
  const a = analysis as { unknownAsks?: unknown };
  if (!Array.isArray(a.unknownAsks)) return [];
  return a.unknownAsks.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function suggestedReply(analysis: unknown): string {
  if (!analysis || typeof analysis !== "object") return "";
  const a = analysis as { suggestedReply?: string };
  return typeof a.suggestedReply === "string" ? a.suggestedReply : "";
}

export function QuoteLifecyclePanel({ quoteId }: { quoteId: string }) {
  const [data, setData] = useState<LifecyclePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/quotes/${quoteId}/lifecycle`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Failed to load lifecycle");
      return;
    }
    setData(json as LifecyclePayload);
    const lastIn = [...(json.messages as LifecycleMessage[])]
      .reverse()
      .find((m) => m.direction === "IN");
    if (lastIn) {
      const draft = suggestedReply(lastIn.analysis);
      if (draft) setReplyBody(draft);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkThread() {
    setChecking(true);
    setMsg("");
    const res = await fetch(`/api/quotes/${quoteId}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check_thread" }),
    });
    const json = await res.json();
    setChecking(false);
    if (!res.ok) {
      setMsg(typeof json.error === "string" ? json.error : "Thread check failed");
      return;
    }
    if (json.lifecycle) setData(json.lifecycle as LifecyclePayload);
    const check = json.check as {
      scanned: number;
      matched: number;
      newReplies: number;
      alreadyCaptured: number;
      buyerEmail: string;
    };
    if (check.newReplies > 0) {
      setMsg(
        `Found ${check.newReplies} new ${check.newReplies === 1 ? "reply" : "replies"} from ${check.buyerEmail || "buyer"} (scanned ${check.scanned}).`
      );
      const lifecycle = json.lifecycle as LifecyclePayload;
      const lastIn = [...(lifecycle.messages || [])]
        .reverse()
        .find((m) => m.direction === "IN");
      if (lastIn) {
        const draft = suggestedReply(lastIn.analysis);
        if (draft) setReplyBody(draft);
      }
    } else if (check.matched > 0) {
      setMsg(
        `No new replies — ${check.alreadyCaptured} message${check.alreadyCaptured === 1 ? "" : "s"} already on this thread.`
      );
    } else {
      setMsg(
        `No matching mail for ${check.buyerEmail || "this quote"} yet (scanned ${check.scanned}).`
      );
    }
  }

  async function clearAssistance() {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/quotes/${quoteId}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_assistance" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(typeof json.error === "string" ? json.error : "Could not clear flag");
      return;
    }
    setData(json.lifecycle);
    setMsg("Assistance flag cleared");
  }

  async function sendReply() {
    if (!replyBody.trim()) {
      setMsg("Write a reply first");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/quotes/${quoteId}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_reply", body: replyBody }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(typeof json.error === "string" ? json.error : "Send failed");
      return;
    }
    setData(json.lifecycle);
    setReplyBody("");
    setMsg("Reply sent");
  }

  if (loading && !data) {
    return (
      <section className="rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <p className="text-sm text-mid-green">Loading quote lifecycle…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <p className="text-sm text-dark-primary">{error || "No lifecycle data"}</p>
      </section>
    );
  }

  const { quote, stages, messages } = data;

  return (
    <section className="space-y-5 rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Quote life &amp; email thread</h2>
          <p className="mt-1 text-sm text-mid-green">
            Track status, buyer replies, and AI analysis for {quote.quoteNumber}
            {quote.buyerEmail ? ` · ${quote.buyerEmail}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={checkThread}
            disabled={checking || busy}
            className="rounded-lg border border-mid-green/40 bg-white/70 px-3 py-1.5 text-sm font-medium text-mid-green hover:bg-light-green/30 disabled:opacity-50"
          >
            {checking ? "Checking thread…" : "Check this email thread"}
          </button>
          <StatusBadge status={quote.status} />
          {quote.lastReplyIntent ? (
            <span className="rounded px-2 py-0.5 text-xs font-medium bg-dark-secondary/10 text-dark-secondary">
              Last intent: {quote.lastReplyIntent.replaceAll("_", " ").toLowerCase()}
            </span>
          ) : null}
          {quote.needsAssistance ? (
            <span className="rounded px-2 py-0.5 text-xs font-medium bg-dark-primary/15 text-dark-primary">
              Needs manual assistance
            </span>
          ) : null}
        </div>
      </div>

      {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}

      {quote.needsAssistance ? (
        <div className="rounded-lg border border-dark-primary/20 bg-dark-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-dark-primary">Manual assistance needed</p>
          <p className="mt-1 text-sm text-dark-primary/80">
            {quote.assistanceReason || quote.lastAnalysisSummary || "Buyer reply needs a human response."}
          </p>
          {(() => {
            const lastIn = [...messages].reverse().find((m) => m.direction === "IN");
            const asks = lastIn ? unknownAsks(lastIn.analysis) : [];
            if (!asks.length) return null;
            return (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dark-primary/80">
                {asks.map((ask) => (
                  <li key={ask}>{ask}</li>
                ))}
              </ul>
            );
          })()}
          <button
            type="button"
            onClick={clearAssistance}
            disabled={busy}
            className="mt-3 text-sm font-medium text-mid-green hover:underline disabled:opacity-50"
          >
            Mark as handled
          </button>
        </div>
      ) : null}

      <ol className="grid gap-2 sm:grid-cols-5">
        {stages.map((stage) => (
          <li
            key={stage.key}
            className={`rounded-lg px-3 py-2 text-sm ${
              stage.active
                ? "bg-mid-green/20 text-dark-primary"
                : stage.done
                  ? "bg-light-green/20 text-dark-primary"
                  : "bg-white/50 text-mid-green"
            }`}
          >
            <p className="font-medium">{stage.label}</p>
            <p className="mt-1 text-xs opacity-80">
              {stage.at ? format(new Date(stage.at), "dd MMM yyyy HH:mm") : "—"}
            </p>
          </li>
        ))}
      </ol>

      <div>
        <h3 className="mb-3 text-sm font-medium text-dark-primary">Email thread</h3>
        {messages.length === 0 ? (
          <p className="text-sm text-mid-green">
            No thread yet. Use <span className="font-medium">Check this email thread</span> after
            the buyer replies, or send the quote first if it is still a draft.
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg px-4 py-3 ${
                  m.direction === "IN" ? "bg-dark-secondary/5" : "bg-light-green/15"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mid-green">
                  <span>
                    {m.direction === "IN" ? "Buyer" : "You"}
                    {m.autoReplied ? " · auto" : ""}
                    {m.intent ? ` · ${m.intent.replaceAll("_", " ").toLowerCase()}` : ""}
                  </span>
                  <span>{format(new Date(m.createdAt), "dd MMM yyyy HH:mm")}</span>
                </div>
                {m.subject ? (
                  <p className="mt-1 text-sm font-medium text-dark-primary">{m.subject}</p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-dark-primary/90">
                  {m.body.slice(0, 1200)}
                  {m.body.length > 1200 ? "…" : ""}
                </p>
                {m.direction === "IN" && analysisSummary(m.analysis) ? (
                  <p className="mt-2 text-xs text-mid-green">
                    Analysis: {analysisSummary(m.analysis)}
                  </p>
                ) : null}
                {m.direction === "IN" && unknownAsks(m.analysis).length > 0 ? (
                  <p className="mt-1 text-xs text-dark-primary/70">
                    Outside quote knowledge: {unknownAsks(m.analysis).join("; ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {quote.buyerEmail ? (
        <div className="border-t border-dark-secondary/10 pt-4">
          <h3 className="mb-2 text-sm font-medium text-dark-primary">Reply to buyer</h3>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={5}
            placeholder="Write a follow-up email…"
            className="w-full rounded-lg border border-dark-secondary/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-mid-green"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendReply}
              disabled={busy}
              className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reply"}
            </button>
            {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
