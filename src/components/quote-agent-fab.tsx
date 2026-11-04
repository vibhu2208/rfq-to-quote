"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { AdminCopilot } from "@/components/admin-copilot";

export function QuoteAgentFab() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <div className="pointer-events-auto flex h-[min(38rem,calc(100dvh-6.5rem))] w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-dark-primary/10 bg-background shadow-[0_20px_60px_rgba(11,43,38,0.28)] sm:w-[min(28rem,calc(100vw-2rem))]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dark-primary/8 bg-dark-secondary px-3 py-2.5 text-background">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mid-green">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">Quote Agent</p>
                <p className="truncate text-[11px] text-light-green/85">
                  Live quotes, GST, and stock
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-light-green hover:bg-background/10 hover:text-background"
              aria-label="Close Quote Agent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AdminCopilot compact panel />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-semibold shadow-[0_12px_32px_rgba(11,43,38,0.28)] transition ${
          open
            ? "bg-dark-primary text-background hover:bg-dark-secondary"
            : "bg-mid-green text-background hover:bg-dark-secondary"
        }`}
        aria-expanded={open}
        aria-label={open ? "Close Quote Agent" : "Open Quote Agent"}
      >
        {open ? <X className="h-4 w-4" strokeWidth={1.8} /> : <Sparkles className="h-4 w-4" strokeWidth={1.6} />}
        <span>Quote Agent</span>
      </button>
    </div>
  );
}
