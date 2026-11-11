"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local `yyyy-MM-ddTHH:mm` for controlled inputs / API payloads. */
export function toLocalDateTimeValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseLocalDateTimeValue(value: string): Date | null {
  if (!value || value.length < 16) return null;
  const parsed = parse(value.slice(0, 16), "yyyy-MM-dd'T'HH:mm", new Date());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Business-day style slots: 07:00–21:00 every 15 minutes. */
const TIME_SLOTS = (() => {
  const slots: { h: number; m: number; key: string; label: string }[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) continue;
      const d = new Date();
      d.setHours(h, m, 0, 0);
      slots.push({
        h,
        m,
        key: `${pad2(h)}:${pad2(m)}`,
        label: format(d, "h:mm a"),
      });
    }
  }
  return slots;
})();

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

type Props = {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  id?: string;
};

function timezoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");
  } catch {
    return "Local time";
  }
}

export function DateTimePicker({ value, onChange, optional = false, id }: Props) {
  const selected = parseLocalDateTimeValue(value);
  const [viewMonth, setViewMonth] = useState(
    () => startOfMonth(selected || new Date())
  );
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [sideBySide, setSideBySide] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const selectedSlotRef = useRef<HTMLButtonElement>(null);
  const today = startOfDay(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const selectedKey =
    selected && [0, 15, 30, 45].includes(selected.getMinutes())
      ? `${pad2(selected.getHours())}:${pad2(selected.getMinutes())}`
      : null;
  const hasDate = Boolean(selected);
  const tz = useMemo(() => timezoneLabel(), []);

  useLayoutEffect(() => {
    const node = calendarRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const sync = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      setPanelHeight((prev) => (prev === next ? prev : next));
      setSideBySide(window.matchMedia("(min-width: 640px)").matches);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(node);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [viewMonth, optional, value]);

  useEffect(() => {
    if (!selectedKey) return;
    selectedSlotRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey, selected?.toDateString()]);

  function commit(date: Date) {
    onChange(toLocalDateTimeValue(date));
  }

  function ensureBase(): Date {
    if (selected) return new Date(selected.getTime());
    const d = new Date();
    d.setHours(10, 0, 0, 0);
    return d;
  }

  function pickDay(day: Date) {
    const next = ensureBase();
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    commit(next);
  }

  function pickSlot(h: number, m: number) {
    const next = ensureBase();
    next.setHours(h, m, 0, 0);
    commit(next);
  }

  return (
    <div
      id={id}
      className="overflow-hidden rounded-2xl border border-dark-primary/10 bg-white shadow-[0_1px_2px_rgba(11,43,38,0.04)]"
    >
      <div className="grid sm:grid-cols-[minmax(0,1.15fr)_minmax(10.5rem,12.5rem)]">
        {/* Calendar — Calendly-style */}
        <div
          ref={calendarRef}
          className="border-b border-dark-primary/8 p-4 sm:border-b-0 sm:border-r"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight text-dark-primary">
              {format(viewMonth, "MMMM yyyy")}
            </p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-mid-green transition-colors hover:bg-mid-green/10 hover:text-dark-primary"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-mid-green transition-colors hover:bg-mid-green/10 hover:text-dark-primary"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((d) => (
              <span
                key={d}
                className="py-1.5 text-center text-[10px] font-semibold tracking-[0.06em] text-mid-green/65"
              >
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const active = selected ? isSameDay(day, selected) : false;
              const todayMark = isToday(day);
              const past = isBefore(startOfDay(day), today);

              if (!inMonth) {
                return (
                  <div
                    key={day.toISOString()}
                    className="flex h-9 items-center justify-center"
                  />
                );
              }

              return (
                <div
                  key={day.toISOString()}
                  className="flex h-9 items-center justify-center"
                >
                  <button
                    type="button"
                    onClick={() => pickDay(day)}
                    aria-pressed={active}
                    aria-label={format(day, "EEEE, MMMM d, yyyy")}
                    className={[
                      "relative flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums transition-all duration-150",
                      active
                        ? "bg-mid-green font-semibold text-white shadow-[0_6px_14px_rgba(45,106,79,0.28)]"
                        : past
                          ? "text-mid-green/40 hover:bg-dark-secondary/8 hover:text-dark-primary"
                          : "font-medium text-dark-primary hover:bg-mid-green/12",
                      !active && todayMark
                        ? "ring-2 ring-inset ring-mid-green/35"
                        : "",
                    ].join(" ")}
                  >
                    {format(day, "d")}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-dark-primary/8 pt-3">
            <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-mid-green">
              <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{tz}</span>
            </p>
            {optional && value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="shrink-0 text-[11px] font-medium text-mid-green transition-colors hover:text-dark-primary"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Time slots — height locked to calendar, then scrolls */}
        <div
          className="flex flex-col overflow-hidden bg-dark-secondary/[0.02] p-3 sm:p-4"
          style={
            sideBySide && panelHeight
              ? { height: panelHeight }
              : undefined
          }
        >
          <div className="mb-2.5 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mid-green/80">
              {hasDate ? format(selected!, "EEEE") : "Select a date"}
            </p>
            <p className="mt-0.5 text-sm font-semibold tracking-tight text-dark-primary">
              {hasDate ? format(selected!, "MMMM d") : "Then pick a time"}
            </p>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
            style={!sideBySide ? { maxHeight: "13rem" } : undefined}
            role="listbox"
            aria-label="Available times"
          >
            {TIME_SLOTS.map((slot) => {
              const active = selectedKey === slot.key;
              return (
                <button
                  key={slot.key}
                  ref={active ? selectedSlotRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pickSlot(slot.h, slot.m)}
                  className={[
                    "flex h-9 w-full shrink-0 items-center justify-center rounded-lg border text-[13px] font-semibold tabular-nums transition-all duration-150",
                    active
                      ? "border-mid-green bg-mid-green text-white shadow-[0_6px_14px_rgba(45,106,79,0.22)]"
                      : "border-mid-green/35 bg-white text-mid-green hover:border-mid-green hover:bg-mid-green/[0.06]",
                  ].join(" ")}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected ? (
        <div className="flex items-center justify-between gap-3 border-t border-dark-primary/8 bg-white px-4 py-2.5">
          <p className="text-[13px] text-mid-green">
            <span className="font-medium text-dark-primary">
              {format(selected, "EEE, MMM d")}
            </span>
            <span className="mx-1.5 text-mid-green/40">·</span>
            <span className="font-semibold tabular-nums text-dark-primary">
              {format(selected, "h:mm a")}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
