"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { groupMasterData } from "@/lib/master-data";

export function MasterDetailDialog({
  title,
  subtitle,
  badge,
  loading,
  kind,
  data,
  actions,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  badge?: string | null;
  loading?: boolean;
  kind: "client" | "product";
  data: unknown;
  actions?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const visible = groupMasterData(data, kind, showEmpty);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-light-green/20 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{title}</h2>
              {badge ? (
                <span className="rounded bg-mid-green/20 px-2 py-0.5 text-xs font-medium text-mid-green">
                  {badge}
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="mt-1 text-sm text-mid-green">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 p-1 text-mid-green" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {children}
          {loading ? (
            <p className="mb-3 text-xs text-mid-green">Loading full master record…</p>
          ) : null}
          {visible.length === 0 && !loading ? (
            <p className="py-8 text-center text-sm text-mid-green">No master fields on this record.</p>
          ) : (
            <div className="space-y-5">
              {visible.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mid-green">
                    {group.title}
                  </h3>
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {group.fields.map((field) => (
                      <div key={field.key} className="rounded-lg bg-white/50 px-3 py-2">
                        <dt className="text-[11px] uppercase tracking-wide text-mid-green">{field.label}</dt>
                        <dd className="mt-0.5 break-words text-sm">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-light-green/20 px-6 py-3">
          <label className="inline-flex items-center gap-2 text-xs text-mid-green">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
            />
            Show empty fields
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-mid-green hover:bg-light-green/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
