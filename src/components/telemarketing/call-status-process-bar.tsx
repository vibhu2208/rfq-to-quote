"use client";

import {
  TELEMARKETING_CALL_STATUSES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";

type Props = {
  activeStatus: string;
  statusCounts: Record<string, number>;
  onSelect: (status: string) => void;
  countsPending?: boolean;
};

export function CallStatusProcessBar({
  activeStatus,
  statusCounts,
  onSelect,
  countsPending = false,
}: Props) {
  const allSelected = !activeStatus || activeStatus === "ALL";

  return (
    <div className="overflow-x-auto pb-0.5">
      <div
        className="inline-flex min-w-full items-stretch"
        role="tablist"
        aria-label="Call status process"
      >
        <ChevronStep
          first
          selected={allSelected}
          label="All"
          count={countsPending ? null : statusCounts.ALL ?? 0}
          title="All contacts"
          onClick={() => onSelect("ALL")}
        />
        {TELEMARKETING_CALL_STATUSES.map((status, index) => {
          const selected = activeStatus === status;
          return (
            <ChevronStep
              key={status}
              last={index === TELEMARKETING_CALL_STATUSES.length - 1}
              selected={selected}
              label={TELEMARKETING_CALL_STATUS_LABELS[status]}
              count={countsPending ? null : statusCounts[status] || 0}
              title={TELEMARKETING_CALL_STATUS_LABELS[status]}
              onClick={() => onSelect(selected ? "ALL" : status)}
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
  count: number | null;
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
            : "bg-background text-dark-primary"
        }`}
      >
        {count == null ? "–" : count}
      </span>
    </button>
  );
}
