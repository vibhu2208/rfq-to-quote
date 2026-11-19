"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  unknownTotal?: boolean;
  onPageChange: (page: number) => void;
};

function pageWindow(current: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = new Set<number>();
  pages.add(0);
  pages.add(totalPages - 1);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i > 0 && i < totalPages - 1) pages.add(i);
  }
  if (current <= 2) {
    pages.add(1);
    pages.add(2);
  }
  if (current >= totalPages - 3) {
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("ellipsis");
    out.push(sorted[i]);
  }
  return out;
}

export function TelemarketingPagination({
  page,
  total,
  pageSize,
  loading,
  unknownTotal,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);
  const items = pageWindow(safePage, totalPages);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-b-lg bg-[#eef1f0] px-4 py-2.5">
      <p className="text-[12px] tabular-nums text-dark-primary/70">
        {unknownTotal
          ? "Loading contacts…"
          : total === 0
            ? "0 of 0"
            : `${from} – ${to} of ${total}`}
        {loading && !unknownTotal ? " · updating…" : ""}
      </p>
      {total > 0 ? (
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={safePage <= 0 || loading}
            onClick={() => onPageChange(safePage - 1)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[12px] font-medium text-dark-primary/55 hover:text-dark-primary disabled:cursor-default disabled:opacity-35"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          {items.map((item, idx) =>
            item === "ellipsis" ? (
              <span
                key={`e-${idx}`}
                className="px-1.5 text-[12px] text-dark-primary/45"
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? "page" : undefined}
                className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-[12px] font-medium tabular-nums transition ${
                  item === safePage
                    ? "bg-dark-secondary text-background"
                    : "text-dark-primary/70 hover:bg-dark-secondary/10 hover:text-dark-primary"
                }`}
              >
                {item + 1}
              </button>
            )
          )}
          <button
            type="button"
            disabled={safePage >= totalPages - 1 || loading}
            onClick={() => onPageChange(safePage + 1)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[12px] font-medium text-dark-primary/70 hover:text-dark-primary disabled:cursor-default disabled:opacity-35"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
