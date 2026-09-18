"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";

type KnowledgeRow = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  source: string;
  active: boolean;
  quoteNumber: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function KnowledgeManager() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnswer, setEditAnswer] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/knowledge");
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Failed to load knowledge");
      return;
    }
    setRows(Array.isArray(json) ? json : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEntry() {
    if (!question.trim() || !answer.trim()) {
      setMsg("Enter both a question and an answer.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(typeof json.error === "string" ? json.error : "Could not save");
      return;
    }
    setQuestion("");
    setAnswer("");
    setMsg("Saved to knowledge base");
    await load();
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, answer: editAnswer.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Could not update answer");
      return;
    }
    setEditingId(null);
    setMsg("Answer updated");
    await load();
  }

  async function setActive(id: string, active: boolean) {
    setBusy(true);
    const res = await fetch("/api/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Could not update entry");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white/40 p-5 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        <h2 className="text-lg font-medium">Add a Q&amp;A</h2>
        <p className="mt-1 text-sm text-mid-green">
          Human answers to buyer questions are also saved automatically when you reply from a quote
          thread that needed assistance.
        </p>
        <div className="mt-4 grid gap-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Buyer question…"
            className="w-full rounded-lg border border-dark-secondary/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-mid-green"
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Approved answer…"
            className="w-full rounded-lg border border-dark-secondary/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-mid-green"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void addEntry()}
              disabled={busy}
              className="rounded-lg bg-mid-green px-4 py-2 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save Q&A"}
            </button>
            {msg ? <p className="text-sm text-mid-green">{msg}</p> : null}
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-dark-primary">{error}</p> : null}

      <section className="overflow-hidden rounded-xl bg-white/40 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
        {loading ? (
          <p className="px-4 py-8 text-sm text-mid-green">Loading knowledge…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mid-green">
            No Q&amp;A yet. Reply to a flagged buyer question, or add one above.
          </p>
        ) : (
          <ul className="divide-y divide-dark-secondary/10">
            {rows.map((row) => (
              <li key={row.id} className={`px-4 py-4 ${row.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-dark-primary">{row.question}</p>
                    {editingId === row.id ? (
                      <textarea
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-dark-secondary/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-mid-green"
                      />
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-dark-primary/80">
                        {row.answer}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-mid-green">
                      {row.source.replaceAll("_", " ").toLowerCase()}
                      {row.quoteNumber ? ` · ${row.quoteNumber}` : ""}
                      {row.createdBy ? ` · ${row.createdBy}` : ""}
                      {" · "}
                      {format(new Date(row.updatedAt), "dd MMM yyyy HH:mm")}
                      {row.tags.length ? ` · ${row.tags.join(", ")}` : ""}
                      {row.active ? "" : " · inactive"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingId === row.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveEdit(row.id)}
                          className="rounded-lg bg-mid-green px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-xs text-mid-green"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditAnswer(row.answer);
                        }}
                        className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-xs text-mid-green"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setActive(row.id, !row.active)}
                      className="rounded-lg border border-mid-green/40 px-3 py-1.5 text-xs text-mid-green disabled:opacity-50"
                    >
                      {row.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
