"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleCancel = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    const first = panel ? getFocusable(panel)[0] : null;
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = getFocusable(panel);
      if (!focusables.length) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleCancel]);

  useEffect(() => {
    if (open) return;
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, [open]);

  if (!open) return null;

  const confirmClass =
    confirmTone === "danger"
      ? "bg-rose-700 hover:bg-rose-800"
      : "bg-[#2f4a2b] hover:bg-[#243b22]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-dark-primary/45"
        aria-label="Dismiss dialog"
        onClick={handleCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold text-dark-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md p-1 text-mid-green hover:bg-dark-secondary/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-mid-green">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm text-mid-green disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}