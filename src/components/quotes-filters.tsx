"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  QUOTE_LIST_STATUSES,
  type QuoteListFilters,
} from "@/lib/quote-list";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-mid-green">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-light-green/40 bg-white/70 px-3 py-2 text-sm outline-none focus:border-mid-green";

export function QuotesFilters({ filters }: { filters: QuoteListFilters }) {
  const router = useRouter();

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [key, raw] of data.entries()) {
      const value = String(raw).trim();
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/quotes?${qs}` : "/quotes");
  }

  return (
    <form
      onSubmit={onSearch}
      className="rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="General search">
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Quote no, buyer, email, phone, GSTIN…"
            className={inputClass}
          />
        </Field>
        <Field label="Client">
          <input
            type="search"
            name="client"
            defaultValue={filters.client}
            placeholder="Company or contact name"
            className={inputClass}
          />
        </Field>
        <Field label="Product">
          <input
            type="search"
            name="product"
            defaultValue={filters.product}
            placeholder="Alias, description, or catalog"
            className={inputClass}
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={filters.status} className={inputClass}>
            <option value="">All statuses</option>
            {QUOTE_LIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From date">
          <input type="date" name="from" defaultValue={filters.from} className={inputClass} />
        </Field>
        <Field label="To date">
          <input type="date" name="to" defaultValue={filters.to} className={inputClass} />
        </Field>
        <Field label="GST">
          <select name="gst" defaultValue={filters.gst} className={inputClass}>
            <option value="">All</option>
            <option value="yes">With GST</option>
            <option value="no">Without GST</option>
          </select>
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-dark-secondary">
            <input
              type="checkbox"
              name="assist"
              value="1"
              defaultChecked={filters.assist === "1"}
              className="rounded border-light-green/40"
            />
            Needs assistance
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green px-3 py-2 text-sm font-medium text-background hover:bg-dark-secondary"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} />
              Search
            </button>
            <Link
              href="/quotes"
              className="inline-flex items-center gap-1.5 rounded-lg border border-light-green/40 bg-white/70 px-3 py-2 text-sm text-dark-secondary hover:bg-white"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
              Clear
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}
