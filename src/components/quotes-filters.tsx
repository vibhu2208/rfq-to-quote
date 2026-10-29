"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Sparkles, X } from "lucide-react";
import {
  quoteListHasFilters,
  quoteListQuery,
  QUOTE_LIST_STATUSES,
  type QuoteListFilters,
} from "@/lib/quote-list";
import { DateRangePicker } from "@/components/date-range-picker";

const fieldClass =
  "h-9 shrink-0 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-[13px] text-dark-primary outline-none placeholder:text-mid-green/65 focus:bg-white focus:ring-1 focus:ring-mid-green/30";

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function QuotesFilters({
  filters,
  total,
  needsHelpCount,
}: {
  filters: QuoteListFilters;
  total: number;
  needsHelpCount: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [dates, setDates] = useState({ from: filters.from, to: filters.to });
  const filtered = quoteListHasFilters({ ...filters, q, from: dates.from, to: dates.to });

  useEffect(() => {
    setQ(filters.q);
    setDates({ from: filters.from, to: filters.to });
  }, [filters.q, filters.from, filters.to]);

  function navigate(next: Partial<QuoteListFilters>) {
    const href = quoteListQuery({
      ...filters,
      q: next.q ?? q,
      from: next.from ?? dates.from,
      to: next.to ?? dates.to,
      client: "",
      product: "",
      status: next.status ?? filters.status,
      gst: next.gst ?? filters.gst,
      assist: next.assist ?? filters.assist,
      page: 1,
    });
    startTransition(() => {
      router.push(href);
    });
  }

  useEffect(() => {
    if (q === filters.q) return;
    const t = window.setTimeout(() => navigate({ q }), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce search text only
  }, [q]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate({ q });
  }

  function commitDates(from: string, to: string) {
    setDates({ from, to });
    navigate({ from, to, q });
  }

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="shrink-0 px-4 py-2.5">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-dark-primary">Quotes</h1>
          <span className="rounded-full bg-dark-secondary/8 px-2 py-0.5 text-xs font-medium tabular-nums text-mid-green">
            {total}
          </span>
          {needsHelpCount > 0 ? (
            <Link
              href="/quotes?assist=1"
              className="rounded-full bg-dark-primary/10 px-2 py-0.5 text-[11px] font-medium text-dark-primary hover:bg-dark-primary/15"
            >
              {needsHelpCount} assist
            </Link>
          ) : null}
        </div>

        <div className="relative min-w-[8rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green/70"
            strokeWidth={1.5}
          />
          <input
            type="search"
            name="q"
            value={q}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, number, client, product…"
            aria-label="Search quotes"
            className="h-9 w-full rounded-full border-0 bg-dark-secondary/[0.05] pl-9 pr-3 text-sm outline-none placeholder:text-mid-green/60 focus:bg-white focus:ring-1 focus:ring-mid-green/30"
          />
        </div>

        <select
          name="status"
          value={filters.status}
          onChange={(e) => navigate({ status: e.target.value, q })}
          aria-label="Status"
          className={`${fieldClass} w-[8.5rem]`}
        >
          <option value="">Status</option>
          {QUOTE_LIST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        <DateRangePicker from={dates.from} to={dates.to} onCommit={commitDates} />

        <select
          name="gst"
          value={filters.gst}
          onChange={(e) => navigate({ gst: e.target.value, q })}
          aria-label="GST"
          className={`${fieldClass} w-[6.5rem]`}
        >
          <option value="">GST</option>
          <option value="yes">With GST</option>
          <option value="no">Without GST</option>
        </select>

        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-dark-secondary/[0.05] px-3 text-[13px] font-medium text-mid-green transition hover:bg-light-green/20 has-[:checked]:bg-mid-green has-[:checked]:text-background">
          <input
            type="checkbox"
            name="assist"
            value="1"
            checked={filters.assist === "1"}
            onChange={(e) => navigate({ assist: e.target.checked ? "1" : "", q })}
            className="sr-only"
          />
          Assist
        </label>

        {filtered ? (
          <Link
            href="/quotes"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm text-mid-green hover:bg-light-green/15"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            Clear
          </Link>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/quotes/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-light-green/35 bg-white px-3.5 text-sm font-medium text-dark-secondary hover:bg-light-green/15"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            New
          </Link>
          <Link
            href="/quotes/generate"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mid-green px-3.5 text-sm font-medium text-background hover:bg-dark-secondary"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
            Generate
          </Link>
        </div>
      </div>
    </form>
  );
}
