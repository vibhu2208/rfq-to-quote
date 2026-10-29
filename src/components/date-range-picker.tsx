"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfDay,
  subDays,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  from: string;
  to: string;
  onCommit: (from: string, to: string) => void;
};

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parseISO(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function label(from: string, to: string) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a && !b) return "Date";
  if (a && !b) return format(a, "d MMM");
  if (!a && b) return format(b, "d MMM");
  if (a && b && isSameDay(a, b)) return format(a, "d MMM yyyy");
  if (a && b && a.getFullYear() === b.getFullYear()) {
    return `${format(a, "d MMM")} – ${format(b, "d MMM")}`;
  }
  return `${format(a!, "d MMM yy")} – ${format(b!, "d MMM yy")}`;
}

function monthDays(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const MonthGrid = memo(function MonthGrid({
  month,
  start,
  end,
  onPick,
}: {
  month: Date;
  start: Date | null;
  end: Date | null;
  onPick: (day: Date) => void;
}) {
  const days = useMemo(() => monthDays(month), [month]);
  const rangeStart = start && end && isAfter(start, end) ? end : start;
  const rangeEnd = start && end && isAfter(start, end) ? start : end;

  return (
    <div className="w-[16.5rem]">
      <p className="mb-2 px-1 text-center text-sm font-semibold text-dark-primary">
        {format(month, "MMMM yyyy")}
      </p>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-mid-green/70">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          if (!inMonth) {
            return <div key={day.toISOString()} className="h-8" />;
          }
          const isStart = rangeStart ? isSameDay(day, rangeStart) : false;
          const isEnd = rangeEnd ? isSameDay(day, rangeEnd) : false;
          const inRange =
            rangeStart &&
            rangeEnd &&
            !isSameDay(rangeStart, rangeEnd) &&
            !isBefore(day, rangeStart) &&
            !isAfter(day, rangeEnd);
          const edge = isStart || isEnd;
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={
                inRange
                  ? isStart
                    ? "rounded-l-full bg-light-green/25"
                    : isEnd
                      ? "rounded-r-full bg-light-green/25"
                      : "bg-light-green/25"
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => onPick(day)}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] ${
                  edge
                    ? "bg-dark-secondary font-semibold text-background"
                    : today
                      ? "font-medium text-mid-green ring-1 ring-mid-green/40"
                      : "text-dark-primary hover:bg-white/80"
                }`}
              >
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function DateRangePicker({ from, to, onCommit }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });
  const committedStart = parseDay(from);
  const committedEnd = parseDay(to);
  const [view, setView] = useState(() => startOfMonth(committedStart ?? new Date()));
  const [draftStart, setDraftStart] = useState<Date | null>(null);

  const start = draftStart ?? committedStart;
  const end = draftStart ? draftStart : committedEnd;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: PointerEvent) {
      const path = e.composedPath();
      if (
        (rootRef.current && path.includes(rootRef.current)) ||
        (popRef.current && path.includes(popRef.current))
      ) {
        return;
      }
      setOpen(false);
      setDraftStart(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setDraftStart(null);
      }
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = rootRef.current;
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    setPos({ top, left, ready: true });
  }, [open]);

  function toggle() {
    setOpen((was) => {
      if (was) {
        setDraftStart(null);
        return false;
      }
      setView(startOfMonth(committedStart ?? new Date()));
      setDraftStart(null);
      setPos((p) => ({ ...p, ready: false }));
      return true;
    });
  }

  const pick = useCallback(
    (day: Date) => {
      const d = startOfDay(day);
      if (!draftStart) {
        setDraftStart(d);
        return;
      }
      const a = isAfter(draftStart, d) ? d : draftStart;
      const b = isAfter(draftStart, d) ? draftStart : d;
      setDraftStart(null);
      setOpen(false);
      onCommit(iso(a), iso(b));
    },
    [draftStart, onCommit],
  );

  function applyPreset(nextFrom: Date, nextTo: Date) {
    setDraftStart(null);
    setOpen(false);
    onCommit(iso(nextFrom), iso(nextTo));
  }

  function clear() {
    setDraftStart(null);
    setOpen(false);
    onCommit("", "");
  }

  const today = useMemo(() => startOfDay(new Date()), [open]);
  const selected = Boolean(from || to);
  const nextMonth = useMemo(() => addMonths(view, 1), [view]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <div
        className={`inline-flex h-9 items-center rounded-full pl-3 pr-1 text-[13px] font-medium ${
          selected
            ? "bg-mid-green/15 text-dark-secondary"
            : "bg-dark-secondary/[0.05] text-mid-green hover:bg-dark-secondary/[0.08]"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 py-1 pr-1"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="whitespace-nowrap">{label(from, to)}</span>
        </button>
        {selected ? (
          <button
            type="button"
            aria-label="Clear dates"
            className="rounded-full p-1 hover:bg-white/70"
            onClick={clear}
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        ) : (
          <span className="w-1" />
        )}
      </div>

      {open
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label="Choose date range"
              style={{ top: pos.top, left: pos.left }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`fixed z-[80] flex rounded-2xl bg-background shadow-[0_16px_48px_rgba(11,43,38,0.16)] ring-1 ring-dark-secondary/10 ${
                pos.ready ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="hidden w-[8.5rem] flex-col gap-0.5 border-r border-light-green/25 bg-white/50 p-2 sm:flex">
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-mid-green/70">
                  Range
                </p>
                <button
                  type="button"
                  onClick={() => applyPreset(today, today)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-dark-secondary hover:bg-light-green/20"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(subDays(today, 6), today)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-dark-secondary hover:bg-light-green/20"
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(subDays(today, 29), today)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-dark-secondary hover:bg-light-green/20"
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(startOfMonth(today), today)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-dark-secondary hover:bg-light-green/20"
                >
                  This month
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="mt-auto rounded-lg px-2.5 py-1.5 text-left text-[13px] text-mid-green hover:bg-light-green/20"
                >
                  Clear
                </button>
              </div>

              <div className="bg-white/70 p-3">
                <div className="mb-1 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => setView((m) => addMonths(m, -1))}
                    className="rounded-full p-1 text-mid-green hover:bg-light-green/20"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <p className="text-[11px] text-mid-green">
                    {draftStart ? "Select end date" : "Select start date"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setView((m) => addMonths(m, 1))}
                    className="rounded-full p-1 text-mid-green hover:bg-light-green/20"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex gap-5">
                  <MonthGrid month={view} start={start} end={end} onPick={pick} />
                  <div className="hidden md:block">
                    <MonthGrid month={nextMonth} start={start} end={end} onPick={pick} />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
