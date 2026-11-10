"use client";

import type { LeadStage } from "@prisma/client";
import { LEAD_STAGE_HINTS, LEAD_STAGE_LABELS } from "@/lib/leads/constants";

/** Full qualification chevron: All + every stage, left → right. */
const FUNNEL_STEPS: LeadStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
  "NEGOTIATION",
  "CLOSED_WON",
  "DISQUALIFIED",
  "DEAL_LOST",
];

type Props = {
  activeStage: string;
  stageCounts: Record<string, number>;
  onSelect: (stage: string) => void;
  totalAll: number;
};

export function LeadProcessBar({
  activeStage,
  stageCounts,
  onSelect,
  totalAll,
}: Props) {
  const allSelected = !activeStage;

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="inline-flex min-w-full items-stretch"
        role="tablist"
        aria-label="Lead qualification process"
      >
        <ChevronStep
          first
          selected={allSelected}
          label="All"
          count={totalAll}
          title="All leads"
          onClick={() => onSelect("")}
        />
        {FUNNEL_STEPS.map((stage, index) => {
          const selected = activeStage === stage;
          return (
            <ChevronStep
              key={stage}
              last={index === FUNNEL_STEPS.length - 1}
              selected={selected}
              label={LEAD_STAGE_LABELS[stage]}
              count={stageCounts[stage] || 0}
              title={LEAD_STAGE_HINTS[stage]}
              onClick={() => onSelect(selected ? "" : stage)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChevronStep({
  label,
  count,
  selected,
  first,
  last,
  title,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  first?: boolean;
  last?: boolean;
  title?: string;
  onClick: () => void;
}) {
  const clip = first
    ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
    : last
      ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)"
      : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      title={title}
      onClick={onClick}
      style={{ clipPath: clip }}
      className={`relative -ml-px flex min-h-[2.75rem] min-w-[7.25rem] flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition first:ml-0 ${
        selected
          ? "z-[1] bg-dark-secondary text-background"
          : "bg-white text-dark-primary ring-1 ring-inset ring-dark-primary/10 hover:bg-dark-secondary/[0.04]"
      } ${first ? "rounded-l-md" : ""} ${last ? "rounded-r-md" : ""}`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`inline-flex min-w-[1.5rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
          selected
            ? "bg-white/20 text-background"
            : "bg-dark-primary/[0.08] text-dark-primary"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
