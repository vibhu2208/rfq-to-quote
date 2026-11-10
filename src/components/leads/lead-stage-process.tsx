"use client";

import type { LeadStage } from "@prisma/client";
import {
  EXIT_STAGES,
  LEAD_STAGE_HINTS,
  LEAD_STAGE_LABELS,
  PROCESS_STAGES,
  nextProcessStage,
  processStepIndex,
  TERMINAL_STAGES,
} from "@/lib/leads/constants";

type Props = {
  stage: LeadStage;
  reasonDraft: string;
  onReasonChange: (value: string) => void;
  onChangeStage: (toStage: LeadStage) => void;
  disabled?: boolean;
};

export function LeadStageProcess({
  stage,
  reasonDraft,
  onReasonChange,
  onChangeStage,
  disabled,
}: Props) {
  const step = processStepIndex(stage);
  const next = nextProcessStage(stage);
  const isExit = EXIT_STAGES.includes(stage);
  const isTerminal = TERMINAL_STAGES.includes(stage);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mid-green">
          Qualification process
        </p>
        <p className="mt-0.5 text-sm text-dark-primary">
          {LEAD_STAGE_HINTS[stage]}
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5">
        {PROCESS_STAGES.map((s, index) => {
          const reached = !isExit && step >= 0 && index <= step;
          const current = s === stage;
          return (
            <li key={s} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span className="text-mid-green/35" aria-hidden>
                  →
                </span>
              ) : null}
              <button
                type="button"
                disabled={disabled || current}
                title={LEAD_STAGE_HINTS[s]}
                onClick={() => onChangeStage(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  current
                    ? s === "CLOSED_WON"
                      ? "bg-mid-green text-white"
                      : "bg-dark-primary text-background"
                    : reached
                      ? "bg-mid-green/15 text-dark-primary"
                      : "bg-dark-secondary/[0.06] text-mid-green hover:bg-dark-secondary/10"
                }`}
              >
                {index + 1}. {LEAD_STAGE_LABELS[s]}
              </button>
            </li>
          );
        })}
      </ol>

      {!isTerminal && next ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChangeStage(next)}
          className="rounded-full bg-mid-green px-3 py-1.5 text-sm font-medium text-white hover:bg-mid-green/90 disabled:opacity-50"
        >
          Advance to {LEAD_STAGE_LABELS[next]}
        </button>
      ) : null}

      {!isTerminal ? (
        <div className="rounded-xl border border-dark-primary/10 bg-dark-secondary/[0.03] p-3">
          <p className="text-xs font-medium text-mid-green">
            Exit this lead (reason required)
          </p>
          <input
            value={reasonDraft}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why is this lead ending?"
            className="mt-2 h-9 w-full rounded-lg bg-white px-3 text-sm outline-none ring-1 ring-dark-primary/10 focus:ring-mid-green/40"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXIT_STAGES.map((exit) => (
              <button
                key={exit}
                type="button"
                disabled={disabled}
                onClick={() => onChangeStage(exit)}
                className="rounded-full border border-dark-primary/15 bg-white px-3 py-1.5 text-xs font-medium text-dark-primary hover:bg-dark-secondary/[0.05] disabled:opacity-50"
              >
                Mark {LEAD_STAGE_LABELS[exit]}
              </button>
            ))}
          </div>
        </div>
      ) : isExit ? (
        <p className="text-xs text-mid-green">
          This lead left the qualification path as{" "}
          <strong>{LEAD_STAGE_LABELS[stage]}</strong>. You can move it back onto
          the process above if needed.
        </p>
      ) : (
        <p className="text-xs text-mid-green">
          Closed won — qualification process complete.
        </p>
      )}
    </div>
  );
}
