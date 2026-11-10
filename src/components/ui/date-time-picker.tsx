"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const TIME_PRESETS = [
  ["09:00", 9, 0],
  ["10:00", 10, 0],
  ["12:00", 12, 0],
  ["14:00", 14, 0],
  ["15:00", 15, 0],
  ["17:00", 17, 0],
] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  id?: string;
};

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
  formatValue = pad2,
}: {
  label: string;
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  formatValue?: (n: number) => string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-mid-green/80">
        {label}
      </p>
      <div
        className="h-[13.5rem] overflow-y-auto rounded-xl bg-white py-1 ring-1 ring-dark-primary/10 [scrollbar-width:thin]"
        role="listbox"
        aria-label={label}
      >
        {values.map((v) => {
          const active = v === selected;
          return (
            <button
              key={v}
              ref={active ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(v)}
              className={[
                "flex h-9 w-full items-center justify-center text-sm tabular-nums transition-colors",
                active
                  ? "bg-mid-green font-semibold text-background"
                  : "text-dark-primary hover:bg-dark-secondary/8",
              ].join(" ")}
            >
              {formatValue(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
      : (Math.round(selected.getMinutes() / 5) * 5) % 60
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
      className="overflow-hidden rounded-2xl border border-dark-primary/10 bg-dark-secondary/[0.03]"
    >
      <div className="flex items-center gap-2.5 border-b border-dark-primary/8 px-4 py-3">
        <CalendarDays className="h-4 w-4 shrink-0 text-mid-green" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-dark-primary">
          {summary}
        </p>
        {optional && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 text-xs font-medium text-mid-green hover:text-dark-primary"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_13.5rem]">
        <div className="border-b border-dark-primary/8 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold tracking-tight text-dark-primary">
              {format(viewMonth, "MMMM yyyy")}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-mid-green hover:bg-dark-secondary/10 hover:text-dark-primary"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span
                key={d}
                className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-mid-green/70"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
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
                    "relative flex h-10 items-center justify-center rounded-xl text-sm tabular-nums transition-colors",
                    inMonth ? "text-dark-primary" : "text-mid-green/35",
                    active
                      ? "bg-mid-green font-semibold text-background hover:bg-dark-secondary"
                      : "hover:bg-dark-secondary/10",
                    !active && today
                      ? "font-semibold ring-1 ring-inset ring-mid-green/40"
                      : "",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-mid-green">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Time
            <span className="ml-auto font-semibold normal-case tracking-normal tabular-nums text-dark-primary">
              {pad2(hour)}:{pad2(minute)}
            </span>
          </div>

          <div className="flex gap-2">
            <TimeColumn
              label="Hour"
              values={HOURS}
              selected={hour}
              onSelect={setHour}
            />
            <TimeColumn
              label="Min"
              values={MINUTES}
              selected={minute}
              onSelect={setMinute}
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {TIME_PRESETS.map(([label, h, m]) => (
              <button
                key={label}
                type="button"
                onClick={() => setTimePreset(h, m)}
                className={[
                  "rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium tabular-nums",
                  hour === h && minute === m
                    ? "bg-mid-green/15 text-dark-primary ring-1 ring-mid-green/25"
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
