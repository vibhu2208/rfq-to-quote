"use client";

import { useEffect, useMemo, useState } from "react";
import { parseLocalDateTimeValue } from "@/components/ui/date-time-picker";
import { validateFutureDateTime } from "@/lib/datetime/future-datetime";

/** Inline validation for follow-up pickers; re-checks while `active` so past slots invalidate. */
export function useFutureDateTimeField(value: string, active: boolean) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active || !value) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [active, value]);

  return useMemo(() => {
    if (!value.trim()) return null;
    const d = parseLocalDateTimeValue(value);
    if (!d || Number.isNaN(d.getTime())) return null;
    void tick;
    return validateFutureDateTime(d, new Date());
  }, [value, tick]);
}