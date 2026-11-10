"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

type Props = {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  id?: string;
};

export function DateTimePicker({ value, onChange, optional = false, id }: Props) {
  const selected = parseLocalDateTimeValue(value);
  const [viewMonth, setViewMonth] = useState(
    () => startOfMonth(selected || new Date())
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const hour = selected?.getHours() ?? 10;
  const minute = selected
    ? MINUTES.includes(selected.getMinutes())
      ? selected.getMinutes()
      : Math.round(selected.getMinutes() / 5) * 5 % 60
    : 0;

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

  function setHour(h: number) {
    const next = ensureBase();
    next.setHours(h);
    commit(next);
  }

  function setMinute(m: number) {
    const next = ensureBase();
    next.setMinutes(m, 0, 0);
    commit(next);
  }

  function setTimePreset(h: number, m: number) {
    const next = ensureBase();
    next.setHours(h, m, 0, 0);
    commit(next);
  }

  const summary = selected
    ? format(selected, "EEE, d MMM yyyy · HH:mm")
    : optional
      ? "No follow-up scheduled"
      : "Pick a date and time";

  return (
    <div
      id={id}
      className="overflow-hidden rounded-xl border border-dark-primary/10 bg-dark-secondary/[0.03]"
    >
      <div className="flex items-center gap-2 border-b border-dark-primary/8 px-3 py-2.5">
        <CalendarDays className="h-4 w-4 shrink-0 text-mid-green" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-dark-primary">
          {summary}
        </p>
        {optional && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 text-[11px] font-medium text-mid-green hover:text-dark-primary"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="grid gap-0 sm:grid-cols-[1fr_8.5rem]">
        <div className="border-b border-dark-primary/8 p-3 sm:border-b-0 sm:border-r">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-semibold text-dark-primary">
              {format(viewMonth, "MMMM yyyy")}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span
                key={d}
                className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-mid-green/70"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const active = selected ? isSameDay(day, selected) : false;
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={[
                    "relative h-8 rounded-lg text-xs transition-colors",
                    inMonth ? "text-dark-primary" : "text-mid-green/40",
                    active
                      ? "bg-mid-green font-semibold text-background hover:bg-dark-secondary"
                      : "hover:bg-dark-secondary/10",
                    !active && today ? "font-semibold ring-1 ring-mid-green/35" : "",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-mid-green">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Time
          </div>
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`${id || "dt"}-hour`}>
              Hour
            </label>
            <select
              id={`${id || "dt"}-hour`}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="h-9 flex-1 rounded-lg bg-white px-2 text-sm outline-none ring-1 ring-dark-primary/10 focus:ring-mid-green/35"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}
                </option>
              ))}
            </select>
            <span className="text-sm font-semibold text-mid-green">:</span>
            <label className="sr-only" htmlFor={`${id || "dt"}-minute`}>
              Minute
            </label>
            <select
              id={`${id || "dt"}-minute`}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="h-9 flex-1 rounded-lg bg-white px-2 text-sm outline-none ring-1 ring-dark-primary/10 focus:ring-mid-green/35"
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["09:00", 9, 0],
                ["10:00", 10, 0],
                ["12:00", 12, 0],
                ["15:00", 15, 0],
                ["17:00", 17, 0],
              ] as const
            ).map(([label, h, m]) => (
              <button
                key={label}
                type="button"
                onClick={() => setTimePreset(h, m)}
                className={[
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  hour === h && minute === m
                    ? "bg-mid-green/15 text-dark-primary"
                    : "bg-white text-mid-green ring-1 ring-dark-primary/8 hover:bg-dark-secondary/8",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
