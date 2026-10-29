"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchQuotePdfBlob } from "@/lib/quote-pdf-client";

export function QuotePdfPreviewModal({
  quoteId,
  quoteNumber,
  quoteName,
  open,
  onClose,
}: {
  quoteId: string;
  quoteNumber: string;
  quoteName?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError("");
    setUrl(null);
    fetchQuotePdfBlob(quoteId)
      .then((blob) => {
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        revoked = next;
        setUrl(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, quoteId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 px-3 py-4 sm:px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`preview-quote-${quoteId}`}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 id={`preview-quote-${quoteId}`} className="text-sm font-medium text-slate-800">
              Quote preview
            </h2>
            <p className="text-[11px] text-slate-500">
              {quoteNumber}
              {quoteName ? ` · ${quoteName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-200"
            aria-label="Close preview"
          >
            <X className="h-5 w-5 text-slate-700" />
          </button>
        </div>
        <div className="min-h-[70vh] bg-slate-100">
          {loading ? (
            <p className="px-4 py-16 text-center text-sm text-mid-green">Generating preview…</p>
          ) : error ? (
            <p className="px-4 py-16 text-center text-sm text-dark-primary">{error}</p>
          ) : url ? (
            <iframe
              title={`${quoteNumber} preview`}
              src={url}
              className="h-[70vh] w-full border-0 bg-white"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
