"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Money, StatusBadge } from "@/components/ui";
import { QuoteRowActions } from "@/components/quote-row-actions";
import { formatQuoteListUpdated } from "@/lib/quote-format";
import {
  quoteListExportHref,
  quoteListQuery,
  quoteListSortQuery,
  type QuoteListFilters,
  type QuoteListSort,
} from "@/lib/quote-list";

const SORT_COLUMNS: Array<{ key: QuoteListSort; label: string; align?: "right" }> = [
  { key: "number", label: "Quote" },
  { key: "buyer", label: "Buyer" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
  { key: "total", label: "Total", align: "right" },
];

function SortHeader({
  column,
  label,
  filters,
  align,
}: {
  column: QuoteListSort;
  label: string;
  filters: QuoteListFilters;
  align?: "right";
}) {
  const active = filters.sort === column;
  const arrow = active ? (filters.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={quoteListSortQuery(filters, column)}
        className={`inline-flex items-center gap-0.5 hover:text-dark-primary ${
          align === "right" ? "w-full justify-end" : ""
        }`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span className="text-[10px]">{arrow || " ↕"}</span>
      </Link>
    </th>
  );
}

export type QuotesListRow = {
  id: string;
  quoteNumber: string;
  quoteName: string;
  status: string;
  buyerCompany: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerState: string;
  needsAssistance: boolean;
  lastReplyIntent: string | null;
  sentAt: string | null;
  issuedAt: string | null;
  updatedAt: string;
  grandTotal: number;
  attachmentCount: number;
  lines: Array<{
    aliasName: string;
    description: string;
    qty: number;
    unitPrice: number;
    discountPercent: number;
  }>;
};

function replyLabel(quote: { lastReplyIntent: string | null; sentAt: string | null }) {
  if (quote.lastReplyIntent) return quote.lastReplyIntent.replaceAll("_", " ").toLowerCase();
  if (quote.sentAt) return "Awaiting";
  return "";
}

export function QuotesListTable({
  quotes,
  filters,
  total,
  filteredTotal,
  fromRow,
  toRow,
  pageCount,
}: {
  quotes: QuotesListRow[];
  filters: QuoteListFilters;
  total: number;
  filteredTotal: number;
  fromRow: number;
  toRow: number;
  pageCount: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");

  const allSelected = quotes.length > 0 && quotes.every((q) => selected.has(q.id));
  const someSelected = selected.size > 0;

  const exportHref = useMemo(() => {
    const base = quoteListExportHref(filters);
    if (selected.size === 0) return base;
    const url = new URL(base, "http://local");
    url.searchParams.set("ids", [...selected].join(","));
    return `${url.pathname}${url.search}`;
  }, [filters, selected]);

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(quotes.map((q) => q.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkStatus(status: string) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      const res = await fetch("/api/quotes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "status", status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(data.error || "Bulk update failed");
      window.location.reload();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      {someSelected ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-light-green/20 bg-light-green/10 px-3 py-2 text-xs">
          <span className="font-medium text-dark-primary">{selected.size} selected</span>
          <a
            href={exportHref}
            className="rounded-full bg-white px-2.5 py-1 font-medium text-mid-green ring-1 ring-light-green/40 hover:bg-light-green/20"
          >
            Export CSV
          </a>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkStatus("DRAFT")}
            className="rounded-full bg-white px-2.5 py-1 font-medium text-mid-green ring-1 ring-light-green/40 hover:bg-light-green/20 disabled:opacity-50"
          >
            Mark draft
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkStatus("UNDER_NEGOTIATION")}
            className="rounded-full bg-white px-2.5 py-1 font-medium text-mid-green ring-1 ring-light-green/40 hover:bg-light-green/20 disabled:opacity-50"
          >
            Mark under negotiation
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-full px-2.5 py-1 text-mid-green hover:bg-white/60"
          >
            Clear
          </button>
          {bulkError ? <span className="text-red-800">{bulkError}</span> : null}
        </div>
      ) : null}

      <QuotesTableBody
        quotes={quotes}
        filters={filters}
        allSelected={allSelected}
        toggleAll={toggleAll}
        toggleOne={toggleOne}
        selected={selected}
      />

      {total > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-light-green/20 px-3 py-2 text-xs text-mid-green">
          <p>
            {fromRow}–{toRow} of {total}
            <span className="mx-2 text-light-green">·</span>
            Filtered value <Money value={filteredTotal} />
          </p>
          {pageCount > 1 ? (
            <div className="flex gap-1.5">
              {filters.page > 1 ? (
                <Link
                  href={quoteListQuery(filters, filters.page - 1)}
                  className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70"
                >
                  Previous
                </Link>
              ) : null}
              {filters.page < pageCount ? (
                <Link
                  href={quoteListQuery(filters, filters.page + 1)}
                  className="rounded-md border border-light-green/40 px-2.5 py-1 hover:bg-white/70"
                >
                  Next
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function QuotesTableBody({
  quotes,
  filters,
  allSelected,
  toggleAll,
  toggleOne,
  selected,
}: {
  quotes: QuotesListRow[];
  filters: QuoteListFilters;
  allSelected: boolean;
  toggleAll: () => void;
  toggleOne: (id: string) => void;
  selected: Set<string>;
}) {
  const empty = quotes.length === 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-10" />
          <col />
          <col />
          <col className="w-[9.5rem]" />
          <col className="w-[7.5rem]" />
          <col className="w-[7.5rem]" />
          <col className="w-[14.5rem]" />
        </colgroup>
        <thead className="sticky top-0 z-10 border-t border-light-green/20 bg-[#fbfaf6] text-[10px] uppercase tracking-wide text-mid-green">
          <tr>
            <th className="px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all quotes on this page"
                className="rounded border-light-green/50"
              />
            </th>
            {SORT_COLUMNS.map((column) => (
              <SortHeader
                key={column.key}
                column={column.key}
                label={column.label}
                filters={filters}
                align={column.align}
              />
            ))}
            <th className="px-2 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={7} className="px-3 py-12 text-center text-sm text-mid-green">
                No quotes on this page.
              </td>
            </tr>
          ) : (
            quotes.map((q) => {
              const reply = replyLabel(q);
              return (
                <tr
                  key={q.id}
                  className={`border-t border-light-green/15 hover:bg-light-green/10 ${
                    q.needsAssistance ? "bg-dark-primary/[0.04]" : ""
                  }`}
                >
                  <td className="px-2 py-2 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => toggleOne(q.id)}
                      aria-label={`Select ${q.quoteNumber}`}
                      className="rounded border-light-green/50"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <Link href={`/quotes/${q.id}`} className="block min-w-0 hover:text-mid-green">
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        <span className="truncate font-medium">{q.quoteNumber}</span>
                        {q.needsAssistance ? (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-dark-primary/15 text-dark-primary">
                            Assist
                          </span>
                        ) : null}
                      </span>
                      {q.quoteName?.trim() ? (
                        <span className="mt-0.5 block truncate text-xs text-mid-green">
                          {q.quoteName}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span
                      className="block truncate"
                      title={q.buyerCompany || q.buyerName || undefined}
                    >
                      {q.buyerCompany || q.buyerName || (
                        <span className="text-mid-green/60">—</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <StatusBadge status={q.status} />
                    {reply ? (
                      <span className="mt-0.5 block truncate text-[11px] text-mid-green">
                        {reply}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap text-mid-green">
                    {formatQuoteListUpdated(q.updatedAt)}
                  </td>
                  <td className="px-3 py-2 align-middle text-right font-medium tabular-nums">
                    <Money value={q.grandTotal} />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <QuoteRowActions
                      quote={{
                        id: q.id,
                        quoteNumber: q.quoteNumber,
                        quoteName: q.quoteName,
                        buyerEmail: q.buyerEmail,
                        buyerPhone: q.buyerPhone,
                        buyerCompany: q.buyerCompany,
                        buyerAddress: q.buyerAddress,
                        buyerState: q.buyerState,
                      }}
                      lines={q.lines}
                      attachmentCount={q.attachmentCount}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}