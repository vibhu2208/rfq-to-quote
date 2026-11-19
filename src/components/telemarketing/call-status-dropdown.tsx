"use client";

import { useEffect, useRef, useState } from "react";
import type { TelemarketingCallStatus } from "@prisma/client";
import { CallStatusPill } from "@/components/telemarketing/status-chip";
import {
  TELEMARKETING_CALL_STATUSES,
  TELEMARKETING_CALL_STATUS_LABELS,
} from "@/lib/telemarketing/constants";

export function CallStatusDropdown({
  status,
  disabled,
  onChange,
  onMoveToLead,
}: {
  status: TelemarketingCallStatus;
  disabled?: boolean;
  onChange: (next: TelemarketingCallStatus) => void | Promise<void>;
  onMoveToLead?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function pick(next: TelemarketingCallStatus) {
    setOpen(false);
    if (next === status) return;
    if (next === "MOVE_TO_LEAD" && onMoveToLead) {
      await onMoveToLead();
      return;
    }
    await onChange(next);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="disabled:opacity-60"
      >
        <CallStatusPill status={status} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-dark-primary/10 bg-white py-1 shadow-lg">
          {TELEMARKETING_CALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-dark-secondary/[0.06]"
              onClick={(e) => {
                e.stopPropagation();
                void pick(s);
              }}
            >
              <CallStatusPill status={s} compact />
              <span className="text-mid-green">{TELEMARKETING_CALL_STATUS_LABELS[s]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}