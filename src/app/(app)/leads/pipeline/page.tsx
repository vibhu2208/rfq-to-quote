"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeadRow } from "@/components/leads/types";
import type { LeadStage } from "@prisma/client";
import {
  EXIT_STAGES,
  LEAD_PRIORITY_LABELS,
  LEAD_STAGE_HINTS,
  LEAD_STAGE_LABELS,
  PROCESS_STAGES,
} from "@/lib/leads/constants";

function StageColumn({
  stage,
  stepLabel,
  leads,
  busy,
  draggingId,
  setDraggingId,
  onDrop,
  tone = "process",
}: {
  stage: LeadStage;
  stepLabel: string;
  leads: LeadRow[];
  busy: boolean;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  onDrop: (stage: string) => void;
  tone?: "process" | "won" | "exit";
}) {
  const headerTone =
    tone === "won"
      ? "bg-mid-green/15"
      : tone === "exit"
        ? "bg-dark-primary/[0.04]"
        : "bg-dark-secondary/[0.04]";

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-2xl ${headerTone}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(stage)}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
            {stepLabel}
          </p>
          <h2 className="text-sm font-semibold text-dark-primary">
            {LEAD_STAGE_LABELS[stage]}
          </h2>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-mid-green">
            {LEAD_STAGE_HINTS[stage]}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            draggable={!busy}
            onDragStart={() => setDraggingId(lead.id)}
            onDragEnd={() => setDraggingId(null)}
            className={`cursor-grab rounded-xl border border-dark-primary/8 bg-white p-3 shadow-sm active:cursor-grabbing ${
              draggingId === lead.id ? "opacity-60" : ""
            }`}
          >
            <Link
              href={`/leads/${lead.id}`}
              className="text-xs font-medium text-mid-green hover:underline"
            >
              {lead.leadNumber}
            </Link>
            <p className="mt-1 text-sm font-medium text-dark-primary">
              {lead.customerCompany || lead.customerName || "Untitled"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-mid-green">
              {lead.subject || lead.rawText.slice(0, 80)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span
                className={
                  lead.priority === "HOT" ? "text-red-600" : "text-mid-green"
                }
              >
                {LEAD_PRIORITY_LABELS[
                  lead.priority as keyof typeof LEAD_PRIORITY_LABELS
                ] || lead.priority}
              </span>
              <span className="text-mid-green">
                {lead.assignedTo?.name?.split(" ")[0] || "Unassigned"}
              </span>
            </div>
          </div>
        ))}
        {!leads.length ? (
          <p className="px-2 py-6 text-center text-xs text-mid-green/70">
            Drop leads here
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads?take=500&intakeKind=REQUIREMENT");
      const data = await res.json();
      setRows(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(
      [...PROCESS_STAGES, ...EXIT_STAGES].map((s) => [s, [] as LeadRow[]])
    ) as Record<string, LeadRow[]>;
    for (const row of rows) {
      (map[row.leadStage] || (map[row.leadStage] = [])).push(row);
    }
    return map;
  }, [rows]);

  async function moveLead(id: string, toStage: string) {
    const needsReason = toStage === "DISQUALIFIED" || toStage === "DEAL_LOST";
    const reason = needsReason
      ? window.prompt(
          toStage === "DISQUALIFIED"
            ? "Disqualification reason (required):"
            : "Deal lost reason (required):"
        ) || ""
      : "";
    if (needsReason && !reason.trim()) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Stage update failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
      setDraggingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-dark-primary">
            Lead Pipeline
          </h1>
          <p className="text-sm text-mid-green">
            Qualification flow: New → Contacted → Qualified → Quote → Negotiate →
            Won · {loading ? "…" : `${rows.length} leads`}
          </p>
        </div>
        <Link
          href="/leads"
          className="rounded-full bg-dark-secondary/8 px-3 py-1.5 text-sm"
        >
          Table view
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {PROCESS_STAGES.map((stage, index) => (
          <StageColumn
            key={stage}
            stage={stage}
            stepLabel={
              stage === "CLOSED_WON" ? "Outcome" : `Step ${index + 1}`
            }
            leads={byStage[stage] || []}
            busy={busy}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            onDrop={(s) => {
              if (draggingId) void moveLead(draggingId, s);
            }}
            tone={stage === "CLOSED_WON" ? "won" : "process"}
          />
        ))}

        <div className="flex w-6 shrink-0 items-center justify-center">
          <div className="h-full w-px bg-dark-primary/15" />
        </div>

        <div className="flex shrink-0 flex-col justify-center px-1">
          <p className="rotate-180 text-[10px] font-medium uppercase tracking-wide text-mid-green [writing-mode:vertical-rl]">
            Exit
          </p>
        </div>

        {EXIT_STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            stepLabel="Exit"
            leads={byStage[stage] || []}
            busy={busy}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            onDrop={(s) => {
              if (draggingId) void moveLead(draggingId, s);
            }}
            tone="exit"
          />
        ))}
      </div>
    </div>
  );
}
