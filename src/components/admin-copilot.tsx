"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, isToday, isYesterday } from "date-fns";
import {
  ChevronRight,
  Loader2,
  MessageSquare,
  PanelLeft,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type CopilotFigure = { label: string; value: string };
type CopilotSection = { title: string; bullets: string[] };

type ChatTurn = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  headline?: string;
  figures?: CopilotFigure[];
  sections?: CopilotSection[];
  missing?: string[];
  sources?: string[];
  thinking?: string[];
  thinkingLive?: boolean;
  thinkingMs?: number;
};

type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type StreamEvent =
  | { type: "thinking"; message?: string }
  | {
      type: "done";
      answer?: string;
      headline?: string;
      figures?: unknown;
      sections?: unknown;
      missing?: unknown;
      sources?: unknown;
      chatId?: string;
      title?: string;
    }
  | { type: "error"; error?: string };

const PENDING_ID = "pending-assistant";

const STARTERS = [
  "Quotes under negotiation",
  "GST on Q-2026-0017",
  "Draft an email for the latest quote",
];

function chatGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const days = differenceInCalendarDays(new Date(), d);
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

function uniqueAppend(steps: string[] | undefined, next: string): string[] {
  const list = steps ?? [];
  if (list[list.length - 1] === next) return list;
  return [...list, next];
}

function asFigures(value: unknown): CopilotFigure[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f: unknown): f is CopilotFigure =>
      Boolean(f) &&
      typeof f === "object" &&
      typeof (f as CopilotFigure).label === "string" &&
      typeof (f as CopilotFigure).value === "string"
  );
}

function asSections(value: unknown): CopilotSection[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s: unknown): s is CopilotSection =>
      Boolean(s) &&
      typeof s === "object" &&
      typeof (s as CopilotSection).title === "string" &&
      Array.isArray((s as CopilotSection).bullets)
  );
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s: unknown): s is string => typeof s === "string");
}

async function readCopilotStream(res: Response, onEvent: (event: StreamEvent) => void) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = (await res.json().catch(() => ({}))) as StreamEvent & { error?: string };
    if (!res.ok) {
      onEvent({
        type: "error",
        error: typeof json.error === "string" ? json.error : "Copilot request failed",
      });
      return;
    }
    onEvent({ ...json, type: "done" });
    return;
  }
  if (!res.body) {
    onEvent({ type: "error", error: "Copilot returned an empty stream." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.replace(/^data:\s?/, "");
      try {
        onEvent(JSON.parse(raw) as StreamEvent);
      } catch {
        /* ignore a partial frame */
      }
    }
  }
}

function AssistantAnswer({ turn }: { turn: ChatTurn }) {
  const hasStructure =
    Boolean(turn.headline) ||
    (turn.figures && turn.figures.length > 0) ||
    (turn.sections && turn.sections.length > 0);

  return (
    <div className="space-y-3">
      {hasStructure ? (
        <>
          {turn.headline ? (
            <p className="text-[15px] leading-relaxed text-dark-primary">{turn.headline}</p>
          ) : null}
          {turn.figures && turn.figures.length > 0 ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              {turn.figures.map((fig) => (
                <div
                  key={`${fig.label}-${fig.value}`}
                  className="rounded-xl border border-dark-primary/8 bg-white/70 px-3 py-2.5"
                >
                  <dt className="text-[11px] uppercase tracking-wide text-mid-green">{fig.label}</dt>
                  <dd className="mt-0.5 text-base font-semibold text-dark-primary">{fig.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {turn.sections && turn.sections.length > 0 ? (
            <div className="space-y-3">
              {turn.sections.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-mid-green">
                    {section.title}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[15px] leading-relaxed text-dark-primary/90">
                    {section.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : turn.content ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-dark-primary/90">
          {turn.content}
        </p>
      ) : null}
      {turn.missing && turn.missing.length > 0 ? (
        <div className="rounded-xl border border-dark-primary/15 bg-dark-primary/5 px-3 py-2">
          <p className="text-xs font-medium text-dark-primary">Not in the books</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-dark-primary/80">
            {turn.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {turn.sources && turn.sources.length > 0 ? (
        <p className="text-xs text-mid-green">Sources: {turn.sources.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function ThinkingBlock({ turn }: { turn: ChatTurn }) {
  const live = Boolean(turn.thinkingLive);
  const steps = turn.thinking ?? [];
  const [open, setOpen] = useState(live);

  useEffect(() => {
    setOpen(live);
  }, [live]);

  if (!live && steps.length === 0) return null;

  const seconds = Math.max(1, Math.round((turn.thinkingMs || 0) / 1000));
  const label = live
    ? "Thinking"
    : `Thought for ${seconds} second${seconds === 1 ? "" : "s"}`;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm text-mid-green hover:text-dark-primary"
      >
        {live ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ChevronRight className={`h-3.5 w-3.5 transition ${open ? "rotate-90" : ""}`} />
        )}
        <span className={live ? "font-medium" : ""}>{label}</span>
      </button>
      {open ? (
        <div className="mt-2 border-l-2 border-light-green/70 pl-3">
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-mid-green">
            {steps.map((step, i) => (
              <li key={`${step}-${i}`} className={i === steps.length - 1 && live ? "text-dark-primary" : ""}>
                {step}
              </li>
            ))}
          </ul>
          {live ? <span className="copilot-caret mt-1 inline-block text-mid-green">▍</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminCopilot({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("New chat");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGen = useRef(0);

  const groupedChats = useMemo(() => {
    const groups: { label: string; items: ChatSummary[] }[] = [];
    for (const chat of chats) {
      const label = chatGroupLabel(chat.updatedAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(chat);
      else groups.push({ label, items: [chat] });
    }
    return groups;
  }, [chats]);

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/admin/copilot/chats");
    const json = await res.json().catch(() => []);
    if (res.ok && Array.isArray(json)) setChats(json as ChatSummary[]);
  }, []);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  function resizeComposer() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function bumpRequest() {
    requestGen.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function openChat(id: string) {
    bumpRequest();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/copilot/chats/${id}`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Could not load chat");
      return;
    }
    setChatId(id);
    setChatTitle(typeof json.title === "string" && json.title ? json.title : "Chat");
    setMessages(Array.isArray(json.messages) ? json.messages : []);
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false);
  }

  function newChat() {
    bumpRequest();
    setChatId(null);
    setChatTitle("New chat");
    setMessages([]);
    setError("");
    setBusy(false);
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function removeChat(id: string) {
    const res = await fetch(`/api/admin/copilot/chats/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (chatId === id) newChat();
    await refreshChats();
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    const history: ChatTurn[] = [...messages, { role: "user", content: text }];
    const gen = ++requestGen.current;
    const startedAt = Date.now();
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setMessages([
      ...history,
      {
        id: PENDING_ID,
        role: "assistant",
        content: "",
        thinking: ["Reading your question"],
        thinkingLive: true,
      },
    ]);
    setInput("");
    setBusy(true);
    setError("");
    if (!chatId) setChatTitle(text.length > 42 ? `${text.slice(0, 39)}…` : text);
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });

    const applyPending = (patch: (turn: ChatTurn) => ChatTurn) => {
      if (gen !== requestGen.current) return;
      setMessages((prev) => prev.map((m) => (m.id === PENDING_ID ? patch(m) : m)));
    };

    try {
      const res = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          ...(chatId ? { chatId } : {}),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      let settled = false;
      await readCopilotStream(res, (event) => {
        if (gen !== requestGen.current) return;
        if (event.type === "thinking" && event.message) {
          applyPending((m) => ({
            ...m,
            thinking: uniqueAppend(m.thinking, event.message as string),
            thinkingLive: true,
          }));
          return;
        }
        if (event.type === "error") {
          settled = true;
          const msg = event.error || "Copilot request failed";
          setError(msg);
          applyPending((m) => ({
            ...m,
            id: undefined,
            content: msg,
            thinkingLive: false,
            thinkingMs: Date.now() - startedAt,
          }));
          setBusy(false);
          return;
        }
        if (event.type === "done") {
          settled = true;
          if (typeof event.chatId === "string" && event.chatId) setChatId(event.chatId);
          if (typeof event.title === "string" && event.title) setChatTitle(event.title);
          applyPending((m) => ({
            ...m,
            id: undefined,
            content: typeof event.answer === "string" ? event.answer : "No answer.",
            headline: typeof event.headline === "string" ? event.headline : undefined,
            figures: asFigures(event.figures),
            sections: asSections(event.sections),
            missing: asStringList(event.missing),
            sources: asStringList(event.sources),
            thinkingLive: false,
            thinkingMs: Date.now() - startedAt,
          }));
          setBusy(false);
          void refreshChats();
        }
      });
      if (!settled && gen === requestGen.current) {
        applyPending((m) => ({
          ...m,
          id: undefined,
          content: m.content || "The copilot stopped before answering. Try again.",
          thinkingLive: false,
          thinkingMs: Date.now() - startedAt,
        }));
      }
    } catch (err) {
      if (gen !== requestGen.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Copilot request failed";
      setError(msg);
      applyPending((m) => ({
        ...m,
        id: undefined,
        content: msg,
        thinkingLive: false,
        thinkingMs: Date.now() - startedAt,
      }));
    } finally {
      if (gen === requestGen.current) setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div
      className={`relative flex min-h-0 overflow-hidden bg-background ${
        compact
          ? "h-[36rem] rounded-xl border border-dark-primary/8 shadow-[0_4px_20px_rgba(11,43,38,0.06)]"
          : "h-full flex-1"
      }`}
    >
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="absolute inset-0 z-20 bg-dark-primary/35 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`absolute inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col bg-dark-secondary text-background transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        <div className="px-3 pt-3">
          <p className="px-1 pb-3 text-sm font-semibold tracking-tight">Copilot</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={newChat}
              className="flex flex-1 items-center gap-2 rounded-lg border border-light-green/25 bg-mid-green/40 px-3 py-2 text-sm font-medium hover:bg-mid-green/60"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              New chat
            </button>
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-mid-green/40 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close chats"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          {chats.length === 0 ? (
            <p className="px-3 text-xs text-light-green/80">Saved chats will appear here.</p>
          ) : (
            groupedChats.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-light-green/70">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((c) => (
                    <li key={c.id}>
                      <div
                        className={`group flex items-center rounded-lg ${
                          chatId === c.id ? "bg-mid-green/70" : "hover:bg-mid-green/35"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void openChat(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
                          <span className="truncate">{c.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeChat(c.id)}
                          className="mr-1 rounded p-1.5 opacity-0 hover:bg-dark-primary/30 group-hover:opacity-100"
                          aria-label={`Delete ${c.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-dark-primary/8 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded-lg p-2 text-mid-green hover:bg-dark-primary/5"
            aria-label="Toggle chats"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-dark-primary">{chatTitle}</p>
            <p className="truncate text-xs text-mid-green">
              Live numbers from quotes, invoices, GST, and stock
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-mid-green text-background">
                <Sparkles className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
              <p className="mt-2 max-w-md text-sm text-mid-green">
                Ask for live books, or tell it to draft or send a quote follow-up. Chats stay saved
                on the left.
              </p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {STARTERS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    className="rounded-full border border-dark-primary/10 bg-white/70 px-3 py-1.5 text-sm text-dark-primary hover:bg-light-green/25"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m, i) => (
                <div key={m.id || `${m.role}-${i}`} className="flex gap-3">
                  {m.role === "assistant" ? (
                    <>
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mid-green text-background">
                        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <ThinkingBlock turn={m} />
                        {!m.thinkingLive ? <AssistantAnswer turn={m} /> : null}
                      </div>
                    </>
                  ) : (
                    <div className="ml-auto max-w-[85%] rounded-2xl bg-light-green/25 px-4 py-2.5 text-[15px] leading-relaxed text-dark-primary">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  )}
                </div>
              ))}
              {error && !messages.some((m) => m.content === error) ? (
                <p className="text-sm text-dark-primary">{error}</p>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2">
          <form
            className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-dark-primary/10 bg-white/80 px-3 py-2 shadow-[0_8px_24px_rgba(11,43,38,0.06)]"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                resizeComposer();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask anything about quotes, invoices, GST, stock…"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-mid-green/70"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mid-green text-background hover:bg-dark-secondary disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-mid-green/80">
            Copilot reads live company data. Enter to send, Shift+Enter for a new line.
          </p>
        </div>
      </section>
    </div>
  );
}
