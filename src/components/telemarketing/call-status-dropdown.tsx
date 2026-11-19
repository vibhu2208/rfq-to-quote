"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { TelemarketingCallStatus } from "@prisma/client";
import { STATUS_CLASS, STATUS_DOT_CLASS } from "@/components/telemarketing/status-chip";
import {
  TELEMARKETING_CALL_STATUSES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";

export function CallStatusDropdown({
  status,
  disabled,
  onChange,
  onMoveToLead,
  onBeforeChange,
  fullLabel = false,
}: {
  status: TelemarketingCallStatus;
  disabled?: boolean;
  onChange: (next: TelemarketingCallStatus) => void | Promise<void>;
  onMoveToLead?: () => void | Promise<void>;
  onBeforeChange?: (
    next: TelemarketingCallStatus
  ) => boolean | void | Promise<boolean | void>;
  /** Avoid truncating long status labels (e.g. drawer meta strip). */
  fullLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(next: TelemarketingCallStatus) {
    setOpen(false);
    if (next === status) return;
    if (onBeforeChange) {
      const cont = await onBeforeChange(next);
      if (cont === false) return;
    }
    if (next === "MOVE_TO_LEAD" && onMoveToLead) {
      await onMoveToLead();
      return;
    }
    await onChange(next);
  }

  return (
    <div ref={rootRef} className="relative inline-block max-w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug disabled:opacity-60 ${
          fullLabel ? "min-w-[9.5rem] max-w-full" : "min-w-[8.5rem] max-w-[11rem]"
        } ${STATUS_CLASS[status]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Call status: ${TELEMARKETING_CALL_STATUS_LABELS[status]}. Change status`}
      >
        <span
          className={`min-w-0 ${fullLabel ? "whitespace-normal text-center" : "truncate"}`}
        >
          {TELEMARKETING_CALL_STATUS_LABELS[status]}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 w-[12.5rem] max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-dark-primary/10 bg-white py-1 shadow-lg"
        >
          {TELEMARKETING_CALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === status}
              className="flex w-full items-center gap-2 whitespace-nowrap px-2.5 py-2 text-left text-xs hover:bg-dark-secondary/[0.06]"
              onClick={(e) => {
                e.stopPropagation();
                void pick(s);
              }}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[s]}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-dark-primary">
                {TELEMARKETING_CALL_STATUS_LABELS[s]}
              </span>
              {s === status ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-mid-green" aria-hidden />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}