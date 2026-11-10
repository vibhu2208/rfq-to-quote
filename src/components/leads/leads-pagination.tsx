"use client";

import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LEADS_PAGE_SIZE } from "@/lib/leads/query";

type Props = {
  page: number;
  total: number;
  pageSize?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export const LeadsPagination = memo(function LeadsPagination({
  page,
  total,
  pageSize = LEADS_PAGE_SIZE,
  loading,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  if (total <= pageSize) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-dark-primary/8 bg-white px-3 py-2 text-[11px] text-mid-green">
        <span>
          {total === 0 ? "No leads" : `${total} lead${total === 1 ? "" : "s"}`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dark-primary/8 bg-white px-3 py-2">
      <p className="text-[11px] text-mid-green">
        {from}–{to} of {total}
        {loading ? " · updating…" : ""}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 0 || loading}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="min-w-[4.5rem] text-center text-[11px] font-medium text-dark-primary">
          {safePage + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages - 1 || loading}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});
