"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import {
  quoteListHasFilters,
  quoteListQuery,
  QUOTE_LIST_STATUSES,
  type QuoteListFilters,
} from "@/lib/quote-list";
import { DateRangePicker } from "@/components/date-range-picker";
import { stabilizeIntakeFile } from "@/lib/intake-file";
import { apiFetch, parseApiJson, userFacingFetchError } from "@/lib/fetch-error";

const fieldClass =
  "h-9 shrink-0 rounded-full border-0 bg-dark-secondary/[0.05] px-3 text-[13px] text-dark-primary outline-none placeholder:text-mid-green/65 focus:bg-white focus:ring-1 focus:ring-mid-green/30";

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SPREADSHEET_ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function QuotesNewButton() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [menuRect, setMenuRect] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function toggleMenu() {
    const box = rootRef.current?.getBoundingClientRect();
    if (box) setMenuRect({ top: box.bottom + 6, left: box.right - 208 });
    setMenuOpen((v) => !v);
  }

  async function importFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const upload = await stabilizeIntakeFile(file);
      const body = new FormData();
      body.append("file", upload);
      const res = await apiFetch("/api/quotes/from-spreadsheet", { method: "POST", body });
      const data = await parseApiJson<{ id?: string; error?: string }>(
        res,
        "Could not import that spreadsheet"
      );
      if (!res.ok || !data.id) {
        setError(
          typeof data.error === "string" ? data.error : "Could not import that spreadsheet"
        );
        return;
      }
      setPickerOpen(false);
      router.push(`/quotes/${data.id}`);
    } catch (err) {
      setError(userFacingFetchError(err, "Could not import that spreadsheet"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const menu =
    mounted && menuOpen && menuRect
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: menuRect.top, left: menuRect.left, width: 208 }}
            className="z-[80] overflow-hidden rounded-xl border border-light-green/40 bg-background shadow-xl"
          >
            <Link
              href="/quotes/new"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-dark-primary hover:bg-light-green/15"
            >
              Blank quote
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError("");
                setPickerOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-dark-primary hover:bg-light-green/15"
            >
              <Upload className="h-3.5 w-3.5 text-mid-green" strokeWidth={1.5} />
              Import CSV / Excel
            </button>
          </div>,
          document.body
        )
      : null;

  const picker =
    mounted && pickerOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-dark-primary/40 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-quote-title"
            onClick={() => {
              if (!uploading) setPickerOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="import-quote-title" className="text-lg font-semibold">
                    Import CSV / Excel
                  </h2>
                  <p className="mt-1 text-sm text-mid-green">
                    Choose a spreadsheet with item, description, qty, unit, rate, and GST.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setPickerOpen(false)}
                  className="rounded-lg p-1.5 text-mid-green hover:bg-light-green/20"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) void importFile(dropped);
                }}
                className={`mt-4 flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${
                  dragOver
                    ? "border-mid-green bg-light-green/20"
                    : "border-light-green/40 bg-[#fbfaf6] hover:border-mid-green/70"
                }`}
              >
                <Upload className="h-5 w-5 text-mid-green" strokeWidth={1.5} />
                <span className="text-sm text-dark-primary">
                  {uploading ? "Importing…" : "Drop a CSV or Excel file here"}
                </span>
                <span className="inline-flex h-9 items-center rounded-full bg-mid-green px-3.5 text-sm font-medium text-background">
                  Choose file
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept={SPREADSHEET_ACCEPT}
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
              </label>

              {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex">
        <Link
          href="/quotes/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-l-full border border-r-0 border-light-green/35 bg-white pl-3.5 pr-2.5 text-sm font-medium text-dark-secondary hover:bg-light-green/15"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          {uploading ? "Importing…" : "New"}
        </Link>
        <button
          type="button"
          disabled={uploading}
          onClick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More new quote options"
          className="inline-flex h-9 items-center rounded-r-full border border-light-green/35 bg-white px-2 text-dark-secondary hover:bg-light-green/15 disabled:opacity-60"
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      {menu}
      {picker}
    </div>
  );
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
          <QuotesNewButton />
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
