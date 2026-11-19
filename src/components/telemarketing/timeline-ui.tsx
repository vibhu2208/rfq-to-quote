"use client";

import { format, isToday, isYesterday } from "date-fns";
import type { TelemarketingTimelineType } from "@prisma/client";

type TimelineRow = {
  id: string;
  type: TelemarketingTimelineType | string;
  title: string;
  body: string;
  createdAt: string;
  actor: { name: string; email: string } | null;
};

const BADGE_CLASS: Record<string, string> = {
  CALL_LOGGED: "bg-emerald-100 text-emerald-900",
  STATUS_CHANGED: "bg-sky-100 text-sky-900",
  CONTACT_ASSIGNED: "bg-violet-100 text-violet-900",
  MARKED_AS_LEAD: "bg-violet-100 text-violet-900",
  CONTACT_CREATED: "bg-amber-100 text-amber-900",
  CONTACT_IMPORTED: "bg-amber-100 text-amber-900",
  ALTERNATIVE_ADDED: "bg-amber-100 text-amber-900",
  CONTACT_UPDATED: "bg-stone-200 text-stone-800",
  REMINDER_CREATED: "bg-amber-100 text-amber-900",
  NOTE: "bg-amber-100 text-amber-900",
  ARCHIVED: "bg-stone-200 text-stone-700",
};

function badgeLabel(type: string) {
  return type.replace(/_/g, " ");
}

function dayHeading(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, d MMM yyyy");
}

export function groupTimelineByDay(events: TimelineRow[]) {
  const groups: { key: string; heading: string; items: TimelineRow[] }[] = [];
  let currentKey = "";
  for (const ev of events) {
    const d = new Date(ev.createdAt);
    const key = format(d, "yyyy-MM-dd");
    if (key !== currentKey) {
      currentKey = key;
      groups.push({ key, heading: dayHeading(d), items: [] });
    }
    groups[groups.length - 1].items.push(ev);
  }
  return groups;
}

export function TelemarketingTimelineList({ events }: { events: TimelineRow[] }) {
  const groups = groupTimelineByDay(events);

  if (!events.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-semibold text-dark-primary">No timeline events yet</p>
        <p className="mt-1 text-xs text-mid-green">Activity will appear here as you work the contact.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-mid-green/80">
            {g.heading}
          </p>
          <ul className="relative space-y-3 pl-4">
            <div
              className="absolute bottom-1 left-[7px] top-1 w-px bg-violet-200"
              aria-hidden
            />
            {g.items.map((ev) => (
              <li key={ev.id} className="relative">
                <span
                  className="absolute -left-4 top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-violet-400 shadow-sm"
                  aria-hidden
                />
                <div className="rounded-lg border border-dark-primary/8 bg-[#faf9f6] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${BADGE_CLASS[ev.type] || "bg-stone-200 text-stone-700"}`}
                    >
                      {badgeLabel(ev.type)}
                    </span>
                    <time className="text-[11px] text-mid-green">
                      {format(new Date(ev.createdAt), "d MMM yyyy, h:mm a")}
                    </time>
                  </div>
                  {ev.body ? (
                    <p className="mt-2 text-[13px] text-dark-primary">{ev.body}</p>
                  ) : ev.title ? (
                    <p className="mt-2 text-[13px] text-dark-primary">{ev.title}</p>
                  ) : null}
                  {ev.actor ? (
                    <p className="mt-1.5 text-[11px] text-mid-green">
                      by {ev.actor.name || ev.actor.email}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}